import { ipcMain } from 'electron'
import { client } from '@bills/db'

// Add IPC handlers for getting bills and expenses data
ipcMain.handle('data:getBills', async (_, filters?: { status?: string }) => {
  try {
    let query = `
      SELECT 
        i.id,
        i.number,
        i.issue_date,
        i.due_date,
        i.expected_payment_date,
        i.amount,
        i.currency,
        i.status,
        i.file_path,
        i.folder_path,
        i.notes,
        i.paid_at,
        i.created_at,
        i.updated_at,
        c.name as client_name,
        c.email as client_email
      FROM invoice i
      LEFT JOIN client c ON i.client_id = c.id
    `
    
    const params: any[] = []
    
    if (filters?.status) {
      query += ` WHERE i.status = $1`
      params.push(filters.status)
    }
    
    query += ` ORDER BY i.created_at DESC`
    
    const result = await client.query(query, params)
    
    return {
      bills: result.rows.map((row: any) => ({
        id: row.id,
        number: row.number,
        clientName: row.client_name,
        clientEmail: row.client_email,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        expectedPaymentDate: row.expected_payment_date,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        filePath: row.file_path,
        folderPath: row.folder_path,
        notes: row.notes,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  } catch (error) {
    return { error: { code: 'GET_BILLS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('data:getExpenses', async (_, filters?: { startDate?: string; endDate?: string }) => {
  try {
    let query = `
      SELECT 
        e.id,
        e.vendor,
        e.category,
        e.date,
        e.amount,
        e.currency,
        e.file_path,
        e.notes,
        e.created_at,
        e.updated_at,
        i.number as invoice_number,
        i.id as invoice_id
      FROM expense e
      LEFT JOIN invoice i ON e.invoice_id = i.id
    `
    
    const params: any[] = []
    const conditions: string[] = []
    
    if (filters?.startDate) {
      conditions.push(`e.date >= $${params.length + 1}`)
      params.push(filters.startDate)
    }
    
    if (filters?.endDate) {
      conditions.push(`e.date <= $${params.length + 1}`)
      params.push(filters.endDate)
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }
    
    query += ` ORDER BY e.date DESC`
    
    const result = await client.query(query, params)
    
    return {
      expenses: result.rows.map((row: any) => ({
        id: row.id,
        vendor: row.vendor,
        category: row.category,
        date: row.date,
        amount: row.amount,
        currency: row.currency,
        filePath: row.file_path,
        notes: row.notes,
        invoiceNumber: row.invoice_number,
        invoiceId: row.invoice_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  } catch (error) {
    return { error: { code: 'GET_EXPENSES_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('data:getStats', async () => {
  try {
    // Get current date info
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear
    
    // Calculate 12 months ago
    const firstOfCurrentMonth = new Date(currentYear, currentMonth - 1, 1)
    const twelveMonthsStart = new Date(firstOfCurrentMonth)
    twelveMonthsStart.setMonth(twelveMonthsStart.getMonth() - 11)
    const twelveMonthsStartStr = twelveMonthsStart.toISOString().slice(0, 10)
    
    // Total paid income
    const totalIncomeResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM invoice 
      WHERE status = 'PAID' OR paid_at IS NOT NULL
    `)
    const totalIncome = (totalIncomeResult.rows[0] as any)?.total || '0'
    
    // Total expenses
    const totalExpensesResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM expense
    `)
    const totalExpenses = (totalExpensesResult.rows[0] as any)?.total || '0'
    
    // Last month income (using expected payment date for grouping)
    const lastMonthIncomeResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM invoice 
      WHERE (status = 'PAID' OR paid_at IS NOT NULL)
        AND EXTRACT(YEAR FROM COALESCE(expected_payment_date, issue_date + 30)) = $1
        AND EXTRACT(MONTH FROM COALESCE(expected_payment_date, issue_date + 30)) = $2
    `, [lastMonthYear, lastMonth])
    const lastMonthIncome = (lastMonthIncomeResult.rows[0] as any)?.total || '0'
    
    // Last month expenses
    const lastMonthExpensesResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM expense 
      WHERE EXTRACT(YEAR FROM date) = $1
        AND EXTRACT(MONTH FROM date) = $2
    `, [lastMonthYear, lastMonth])
    const lastMonthExpenses = (lastMonthExpensesResult.rows[0] as any)?.total || '0'
    
    // Calculate net income
    const netIncome = (parseFloat(totalIncome) - parseFloat(totalExpenses)).toString()

    // Monthly aggregation for last 12 months (including current month)
    // Use expected_payment_date (or issue_date + 30 days) for grouping, even for paid invoices
    const incomeByMonthRes = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM COALESCE(expected_payment_date, issue_date + 30)) AS year,
        EXTRACT(MONTH FROM COALESCE(expected_payment_date, issue_date + 30)) AS month,
        COALESCE(SUM(amount), 0) AS total
      FROM invoice
      WHERE (status = 'PAID' OR paid_at IS NOT NULL)
        AND COALESCE(expected_payment_date, issue_date + 30) >= $1
      GROUP BY 1,2
      ORDER BY 1,2
    `, [twelveMonthsStartStr])

    const expensesByMonthRes = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM date) AS year,
        EXTRACT(MONTH FROM date) AS month,
        COALESCE(SUM(amount), 0) AS total
      FROM expense
      WHERE date >= $1
      GROUP BY 1,2
      ORDER BY 1,2
    `, [twelveMonthsStartStr])

    // Expected income by expected_payment_date for last 12 months and next 12 months
    const expectedWindowStart = new Date(twelveMonthsStart)
    const expectedWindowEnd = new Date(firstOfCurrentMonth)
    expectedWindowEnd.setMonth(expectedWindowEnd.getMonth() + 12) // next 12 months
    const expectedStartStr = expectedWindowStart.toISOString().slice(0,10)
    const expectedEndStr = expectedWindowEnd.toISOString().slice(0,10)

    const expectedIncomeByMonthRes = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM COALESCE(expected_payment_date, issue_date + 30)) AS year,
        EXTRACT(MONTH FROM COALESCE(expected_payment_date, issue_date + 30)) AS month,
        COALESCE(SUM(amount), 0) AS total
      FROM invoice
      WHERE COALESCE(expected_payment_date, issue_date + 30) BETWEEN $1 AND $2
      GROUP BY 1,2
      ORDER BY 1,2
    `, [expectedStartStr, expectedEndStr])

    // Expected income from unpaid bills by expected_payment_date
    const unpaidExpectedIncomeByMonthRes = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM COALESCE(expected_payment_date, issue_date + 30)) AS year,
        EXTRACT(MONTH FROM COALESCE(expected_payment_date, issue_date + 30)) AS month,
        COALESCE(SUM(amount), 0) AS total
      FROM invoice
      WHERE COALESCE(expected_payment_date, issue_date + 30) BETWEEN $1 AND $2
        AND status != 'PAID' AND paid_at IS NULL
      GROUP BY 1,2
      ORDER BY 1,2
    `, [expectedStartStr, expectedEndStr])

    const incomeMap = new Map<string, string>()
    for (const row of incomeByMonthRes.rows as any[]) {
      const y = Math.trunc(row.year)
      const m = Math.trunc(row.month)
      const key = `${y}-${String(m).padStart(2, '0')}`
      incomeMap.set(key, (row.total ?? '0').toString())
    }

    const expensesMap = new Map<string, string>()
    for (const row of (expensesByMonthRes.rows as any[])) {
      const y = Math.trunc(row.year)
      const m = Math.trunc(row.month)
      const key = `${y}-${String(m).padStart(2, '0')}`
      expensesMap.set(key, (row.total ?? '0').toString())
    }

    const monthlyData: Array<{ year: number; month: number; income: string; expenses: string }> = []
    const iter = new Date(twelveMonthsStart)
    for (let i = 0; i < 12; i++) {
      const y = iter.getFullYear()
      const m = iter.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      monthlyData.push({
        year: y,
        month: m,
        income: incomeMap.get(key) || '0',
        expenses: expensesMap.get(key) || '0'
      })
      iter.setMonth(iter.getMonth() + 1)
    }

    // Assemble expected monthly over 24-month window (12 past + 12 next)
    const expectedMap = new Map<string, string>()
    for (const row of (expectedIncomeByMonthRes.rows as any[])) {
      const y = Math.trunc(row.year)
      const m = Math.trunc(row.month)
      const key = `${y}-${String(m).padStart(2, '0')}`
      expectedMap.set(key, (row.total ?? '0').toString())
    }

    // Assemble unpaid expected monthly data
    const unpaidExpectedMap = new Map<string, string>()
    for (const row of (unpaidExpectedIncomeByMonthRes.rows as any[])) {
      const y = Math.trunc(row.year)
      const m = Math.trunc(row.month)
      const key = `${y}-${String(m).padStart(2, '0')}`
      unpaidExpectedMap.set(key, (row.total ?? '0').toString())
    }

    const expectedMonthlyData: Array<{ year: number; month: number; expectedIncome: string; expenses: string }> = []
    const unpaidExpectedMonthlyData: Array<{ year: number; month: number; expectedIncomeUnpaid: string }> = []
    const iter2 = new Date(expectedWindowStart)
    for (let i = 0; i < 24; i++) {
      const y = iter2.getFullYear()
      const m = iter2.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      expectedMonthlyData.push({
        year: y,
        month: m,
        expectedIncome: expectedMap.get(key) || '0',
        expenses: expensesMap.get(key) || '0'
      })
      unpaidExpectedMonthlyData.push({
        year: y,
        month: m,
        expectedIncomeUnpaid: unpaidExpectedMap.get(key) || '0'
      })
      iter2.setMonth(iter2.getMonth() + 1)
    }

    // Simple projection for next 12 months using last 12 months average growth for net
    const nets: number[] = monthlyData.map((m) => parseFloat(m.income) - parseFloat(m.expenses))
    const growthRates: number[] = []
    for (let i = 1; i < nets.length; i++) {
      const prev = nets[i-1]
      const curr = nets[i]
      if (prev !== 0) growthRates.push((curr - prev) / Math.abs(prev))
    }
    const avgGrowth = growthRates.length ? (growthRates.reduce((a,b)=>a+b,0) / growthRates.length) : 0
    const lastNet = nets[nets.length - 1] || 0

    const projectionNetNextYear: Array<{ year: number; month: number; projectedNet: string }> = []
    const iter3 = new Date(firstOfCurrentMonth)
    for (let i = 0; i < 12; i++) {
      iter3.setMonth(iter3.getMonth() + 1)
      const y = iter3.getFullYear()
      const m = iter3.getMonth() + 1
      const value = (i === 0 ? lastNet : parseFloat(projectionNetNextYear[i-1].projectedNet)) * (1 + avgGrowth)
      projectionNetNextYear.push({ year: y, month: m, projectedNet: value.toFixed(2) })
    }

    // Placeholder ML projection: simple exponential smoothing updated when new data comes in
    // In real scenario, this would be replaced with a more sophisticated model and persisted state
    const alpha = 0.4
    let smoothed = nets[0] || 0
    for (let i = 1; i < nets.length; i++) {
      smoothed = alpha * nets[i] + (1 - alpha) * smoothed
    }
    const mlProjection: Array<{ year: number; month: number; projectedNet: string }> = []
    const iter4 = new Date(firstOfCurrentMonth)
    let mlCurrent = smoothed
    for (let i = 0; i < 12; i++) {
      iter4.setMonth(iter4.getMonth() + 1)
      const y = iter4.getFullYear()
      const m = iter4.getMonth() + 1
      mlCurrent = alpha * mlCurrent + (1 - alpha) * mlCurrent // hold level
      mlProjection.push({ year: y, month: m, projectedNet: mlCurrent.toFixed(2) })
    }
    
    return {
      totals: { income: totalIncome, expenses: totalExpenses, net: netIncome },
      lastMonth: { income: lastMonthIncome, expenses: lastMonthExpenses },
      monthlyData,
      expectedMonthlyData,
      unpaidExpectedMonthlyData,
      projectionNetNextYear,
      mlProjectionNetNextYear: mlProjection
    }
  } catch (error) {
    return { error: { code: 'GET_STATS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})
