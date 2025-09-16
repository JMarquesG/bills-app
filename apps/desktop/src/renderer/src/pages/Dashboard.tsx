import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Kpi } from '../components/Kpi'
import { PageHeader } from '../components/PageHeader'

interface StatsData {
  totals: {
    income: string
    expenses: string
    net: string
  }
  lastMonth: {
    income: string
    expenses: string
  }
  monthlyData: {
    year: number
    month: number
    income: string
    expenses: string
  }[]
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (!window.api) {
          setStats({
            totals: { income: '0', expenses: '0', net: '0' },
            lastMonth: { income: '0', expenses: '0' },
            monthlyData: []
          })
          return
        }
        const result = await window.api.getStats()
        if ((result as any)?.error) {
          setStats({
            totals: { income: '0', expenses: '0', net: '0' },
            lastMonth: { income: '0', expenses: '0' },
            monthlyData: []
          })
          return
        }
        setStats(result as any)
      } catch (error) {
        // Fallback to mock data if API is unavailable
        setStats({
          totals: { income: '0', expenses: '0', net: '0' },
          lastMonth: { income: '0', expenses: '0' },
          monthlyData: []
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  const formatCurrency = (value: string, currency = 'EUR') => {
    const num = parseFloat(value)
    return `${currency} ${num.toFixed(2)}`
  }

  const chartData = stats?.monthlyData.map(item => ({
    name: `${MONTH_NAMES[item.month - 1]} ${item.year}`,
    income: parseFloat(item.income),
    expenses: parseFloat(item.expenses),
    net: parseFloat(item.income) - parseFloat(item.expenses)
  })) || []

  const totalIncome = stats ? formatCurrency(stats.totals.income) : '€0.00'
  const totalExpenses = stats ? formatCurrency(stats.totals.expenses) : '€0.00'
  const totalNet = stats ? formatCurrency(stats.totals.net) : '€0.00'
  const lastMonthIncome = stats ? formatCurrency(stats.lastMonth.income) : '€0.00'
  const lastMonthExpenses = stats ? formatCurrency(stats.lastMonth.expenses) : '€0.00'
  const lastMonthNet = stats ? formatCurrency((parseFloat(stats.lastMonth.income) - parseFloat(stats.lastMonth.expenses)).toString()) : '€0.00'

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        <div>Error: {error}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-6 text-center">
        <div className="text-muted-foreground">No data available</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your business performance</p>
        </div>
      </div>

      {/* KPIs - Live Summary Cards */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="dashboard-card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Total Income</p>
              <h3 className="text-2xl font-bold text-foreground mb-2">{totalIncome}</h3>
              <p className="text-xs text-muted-foreground">Lifetime</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
        <div className="dashboard-card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
              <h3 className="text-2xl font-bold text-foreground mb-2">{totalExpenses}</h3>
              <p className="text-xs text-muted-foreground">Lifetime</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
        <div className="dashboard-card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Net Income</p>
              <h3 className="text-2xl font-bold text-foreground mb-2">{totalNet}</h3>
              <p className="text-xs text-muted-foreground">Income − Expenses</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{backgroundColor: 'rgba(242, 200, 237, 0.1)'}}>
              <svg className="h-5 w-5" fill="none" stroke="#F2C8ED" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </div>
        <div className="dashboard-card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Last Month Net</p>
              <h3 className="text-2xl font-bold text-foreground mb-2">{lastMonthNet}</h3>
              <p className="text-xs" style={{color: '#20AEF3'}}>Income {lastMonthIncome} • Expenses {lastMonthExpenses}</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{backgroundColor: 'rgba(32, 174, 243, 0.1)'}}>
              <svg className="h-5 w-5" fill="none" stroke="#20AEF3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Income vs Expenses Bar Chart */}
        <div className="dashboard-card bg-card p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-5">
            Monthly Income vs Expenses
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: number) => [`€${value.toFixed(2)}`, '']} />
              <Legend />
              <Bar dataKey="income" fill="#10b981" name="Income" />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Net Income Trend Line Chart */}
        <div className="dashboard-card bg-card p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-5">
            Net Income Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: number) => [`€${value.toFixed(2)}`, 'Net Income']} />
              <Line 
                type="monotone" 
                dataKey="net" 
                stroke="#2563eb" 
                strokeWidth={2}
                dot={{ fill: '#2563eb' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
