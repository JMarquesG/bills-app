import { ipcMain } from "electron";
import {
  createDataBackup,
  checkForBackupFiles,
  resetAndRestoreDatabase,
  client,
} from "@bills/db";
import { z } from "zod";

// Backup and Restore IPC Handlers

const dataRootPathSchema = z.object({
  dataRootPath: z.string().min(1),
});

// Create backup of all database data
ipcMain.handle("data:createBackup", async (_, data: unknown) => {
  try {
    console.log("💾 IPC: data:createBackup called with data:", data);

    const parsed = dataRootPathSchema.parse(data);

    await createDataBackup(parsed.dataRootPath);

    return { ok: true };
  } catch (error) {
    console.error("❌ Failed to create backup:", error);
    return {
      error: {
        code: "CREATE_BACKUP_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
});

// Check if backup files exist in a directory
ipcMain.handle("data:checkForBackup", async (_, data: unknown) => {
  try {
    const parsed = dataRootPathSchema.parse(data);

    const result = await checkForBackupFiles(parsed.dataRootPath);

    return result;
  } catch (error) {
    console.error("❌ Failed to check for backup:", error);
    return {
      error: {
        code: "CHECK_BACKUP_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
});

// Reset database and restore from backup
ipcMain.handle("data:resetAndRestore", async (_, data: unknown) => {
  try {
    console.log("🔄 IPC: data:resetAndRestore called with data:", data);

    const parsed = dataRootPathSchema.parse(data);

    await resetAndRestoreDatabase(parsed.dataRootPath);

    return { ok: true };
  } catch (error) {
    console.error("❌ Failed to reset and restore database:", error);
    return {
      error: {
        code: "RESET_RESTORE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
});

// Data fetching IPC handlers

// Get all bills with optional filtering
ipcMain.handle("data:getBills", async (_, filters: unknown) => {
  try {
    const filterSchema = z
      .object({
        status: z.string().optional(),
      })
      .optional();

    const parsedFilters = filterSchema.parse(filters) || {};

    let query = `
      SELECT 
        i.id,
        i.number,
        i.client_id,
        i.issue_date,
        i.expected_payment_date,
        i.amount,
        i.currency,
        i.status,
        i.file_path,
        i.folder_path,
        i.description,
        i.notes,
        i.paid_at,
        i.created_at,
        i.updated_at,
        c.name as client_name,
        c.email as client_email
      FROM invoice i
      LEFT JOIN client c ON i.client_id = c.id
    `;

    const queryParams: any[] = [];

    if (parsedFilters.status) {
      query += " WHERE i.status = $1";
      queryParams.push(parsedFilters.status);
    }

    query += " ORDER BY i.issue_date DESC";

    const result = await client.query(query, queryParams);

    const bills = result.rows.map((row: any) => ({
      id: row.id,
      number: row.number,
      clientId: row.client_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      issueDate: row.issue_date,
      expectedPaymentDate: row.expected_payment_date,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      filePath: row.file_path,
      folderPath: row.folder_path,
      description: row.description,
      notes: row.notes,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { bills };
  } catch (error) {
    console.error("❌ Failed to get bills:", error);
    return {
      error: {
        code: "GET_BILLS_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
});

// Get all expenses with optional date filtering
ipcMain.handle("data:getExpenses", async (_, filters: unknown) => {
  try {
    const filterSchema = z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
      .optional();

    const parsedFilters = filterSchema.parse(filters) || {};

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
    `;

    const queryParams: any[] = [];
    const whereClauses: string[] = [];

    if (parsedFilters.startDate) {
      whereClauses.push(`e.date >= $${queryParams.length + 1}`);
      queryParams.push(parsedFilters.startDate);
    }

    if (parsedFilters.endDate) {
      whereClauses.push(`e.date <= $${queryParams.length + 1}`);
      queryParams.push(parsedFilters.endDate);
    }

    if (whereClauses.length > 0) {
      query += " WHERE " + whereClauses.join(" AND ");
    }

    query += " ORDER BY e.date DESC";

    const result = await client.query(query, queryParams);

    const expenses = result.rows.map((row: any) => ({
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
      updatedAt: row.updated_at,
    }));

    return { expenses };
  } catch (error) {
    console.error("❌ Failed to get expenses:", error);
    return {
      error: {
        code: "GET_EXPENSES_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
});

// Get dashboard statistics
ipcMain.handle("data:getStats", async () => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;

    // Get total income (all invoices)
    const totalIncomeResult = await client.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM invoice"
    );
    const totalIncome = totalIncomeResult.rows[0] as { total: string };

    // Get total expenses
    const totalExpensesResult = await client.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM expense"
    );
    const totalExpenses = totalExpensesResult.rows[0] as { total: string };

    // Calculate total net
    const totalNet =
      parseFloat(totalIncome.total) - parseFloat(totalExpenses.total);

    // Get last year income
    const lastYearIncomeResult = await client.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM invoice WHERE EXTRACT(YEAR FROM issue_date) = $1",
      [lastYear]
    );
    const lastYearIncome = lastYearIncomeResult.rows[0] as { total: string };

    // Get last year expenses
    const lastYearExpensesResult = await client.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE EXTRACT(YEAR FROM date) = $1",
      [lastYear]
    );
    const lastYearExpenses = lastYearExpensesResult.rows[0] as { total: string };

    // Calculate last year net
    const lastYearNet =
      parseFloat(lastYearIncome.total) - parseFloat(lastYearExpenses.total);

    // Get quarterly data from the first bill to current period
    const quarterlyDataResult = await client.query(`
      WITH quarterly_income AS (
        SELECT 
          EXTRACT(YEAR FROM issue_date) as year,
          CASE 
            WHEN EXTRACT(MONTH FROM issue_date) BETWEEN 1 AND 3 THEN 1
            WHEN EXTRACT(MONTH FROM issue_date) BETWEEN 4 AND 6 THEN 2
            WHEN EXTRACT(MONTH FROM issue_date) BETWEEN 7 AND 9 THEN 3
            ELSE 4
          END as quarter,
          COALESCE(SUM(amount), 0) as income
        FROM invoice 
        GROUP BY EXTRACT(YEAR FROM issue_date), 
          CASE 
            WHEN EXTRACT(MONTH FROM issue_date) BETWEEN 1 AND 3 THEN 1
            WHEN EXTRACT(MONTH FROM issue_date) BETWEEN 4 AND 6 THEN 2
            WHEN EXTRACT(MONTH FROM issue_date) BETWEEN 7 AND 9 THEN 3
            ELSE 4
          END
      ),
      quarterly_expenses AS (
        SELECT 
          EXTRACT(YEAR FROM date) as year,
          CASE 
            WHEN EXTRACT(MONTH FROM date) BETWEEN 1 AND 3 THEN 1
            WHEN EXTRACT(MONTH FROM date) BETWEEN 4 AND 6 THEN 2
            WHEN EXTRACT(MONTH FROM date) BETWEEN 7 AND 9 THEN 3
            ELSE 4
          END as quarter,
          COALESCE(SUM(amount), 0) as expenses
        FROM expense 
        GROUP BY EXTRACT(YEAR FROM date), 
          CASE 
            WHEN EXTRACT(MONTH FROM date) BETWEEN 1 AND 3 THEN 1
            WHEN EXTRACT(MONTH FROM date) BETWEEN 4 AND 6 THEN 2
            WHEN EXTRACT(MONTH FROM date) BETWEEN 7 AND 9 THEN 3
            ELSE 4
          END
      )
      SELECT 
        COALESCE(i.year, e.year) as year,
        COALESCE(i.quarter, e.quarter) as quarter,
        COALESCE(i.income, 0) as income,
        COALESCE(e.expenses, 0) as expenses,
        COALESCE(i.income, 0) - COALESCE(e.expenses, 0) as net
      FROM quarterly_income i
      FULL OUTER JOIN quarterly_expenses e ON i.year = e.year AND i.quarter = e.quarter
      ORDER BY year, quarter
    `);

    const quarterlyData = quarterlyDataResult.rows.map((row: any) => ({
      year: parseInt(row.year),
      quarter: parseInt(row.quarter),
      quarterLabel: `Q${row.quarter} ${row.year}`,
      income: parseFloat(row.income),
      expenses: parseFloat(row.expenses),
      net: parseFloat(row.net),
    }));

    // Get current year data for comparison
    const currentYearIncomeResult = await client.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM invoice WHERE EXTRACT(YEAR FROM issue_date) = $1",
      [currentYear]
    );
    const currentYearIncome = currentYearIncomeResult.rows[0] as {
      total: string;
    };

    const currentYearExpensesResult = await client.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM expense WHERE EXTRACT(YEAR FROM date) = $1",
      [currentYear]
    );
    const currentYearExpenses = currentYearExpensesResult.rows[0] as {
      total: string;
    };

    const currentYearNet =
      parseFloat(currentYearIncome.total) -
      parseFloat(currentYearExpenses.total);

    return {
      totals: {
        income: parseFloat(totalIncome.total),
        expenses: parseFloat(totalExpenses.total),
        net: totalNet,
      },
      lastYear: {
        income: parseFloat(lastYearIncome.total),
        expenses: parseFloat(lastYearExpenses.total),
        net: lastYearNet,
      },
      currentYear: {
        income: parseFloat(currentYearIncome.total),
        expenses: parseFloat(currentYearExpenses.total),
        net: currentYearNet,
      },
      quarterlyData,
    };
  } catch (error) {
    console.error("❌ Failed to get dashboard stats:", error);
    return {
      error: {
        code: "GET_STATS_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
});
