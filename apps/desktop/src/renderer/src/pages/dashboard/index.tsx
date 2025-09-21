import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts'

interface DashboardStats {
  totals: {
    income: number
    expenses: number
    net: number
  }
  lastYear: {
    income: number
    expenses: number
    net: number
  }
  currentYear: {
    income: number
    expenses: number
    net: number
  }
  quarterlyData: {
    year: number
    quarter: number
    quarterLabel: string
    income: number
    expenses: number
    net: number
  }[]
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardStats()
  }, [])

  const loadDashboardStats = async () => {
    try {
      if (!window.api) return
      
      setLoading(true)
      const result = await window.api.getStats()
      
      if (result.error) {
        setError(result.error.message)
        return
      }
      
      // Cast result to DashboardStats since we know the structure from our IPC handler
      setStats(result as DashboardStats)
    } catch (err) {
      setError('Failed to load dashboard statistics')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-destructive">Error: {error}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">No data available</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Financial Dashboard" subtitle="Overview of your business finances" />
      
      {/* Total Financial Summary */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-card-foreground">Total Financial Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="apple-card bg-card p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-card-foreground mb-2">Total Income</h3>
              <div className="text-3xl font-bold text-green-500">
                {formatCurrency(stats.totals.income)}
              </div>
            </div>
          </div>

          <div className="apple-card bg-card p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-card-foreground mb-2">Total Expenses</h3>
              <div className="text-3xl font-bold text-red-500">
                {formatCurrency(stats.totals.expenses)}
              </div>
            </div>
          </div>

          <div className="apple-card bg-card p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-card-foreground mb-2">Total Net</h3>
              <div className={`text-3xl font-bold ${stats.totals.net >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(stats.totals.net)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Year Comparison */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-card-foreground">Year Comparison</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="apple-card bg-card p-6">
            <h3 className="text-lg font-semibold text-card-foreground mb-2">Income Comparison</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Year</span>
                <span className="text-sm font-medium">{formatCurrency(stats.lastYear.income)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">This Year</span>
                <span className="text-sm font-medium text-green-500">{formatCurrency(stats.currentYear.income)}</span>
              </div>
            </div>
          </div>

          <div className="apple-card bg-card p-6">
            <h3 className="text-lg font-semibold text-card-foreground mb-2">Expenses Comparison</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Year</span>
                <span className="text-sm font-medium">{formatCurrency(stats.lastYear.expenses)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">This Year</span>
                <span className="text-sm font-medium text-red-500">{formatCurrency(stats.currentYear.expenses)}</span>
              </div>
            </div>
          </div>

          <div className="apple-card bg-card p-6">
            <h3 className="text-lg font-semibold text-card-foreground mb-2">Net Comparison</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Year</span>
                <span className={`text-sm font-medium ${stats.lastYear.net >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(stats.lastYear.net)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">This Year</span>
                <span className={`text-sm font-medium ${stats.currentYear.net >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(stats.currentYear.net)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quarterly Trends */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-card-foreground">Quarterly Financial Trends</h2>
        
        {stats.quarterlyData.length > 0 ? (
          <div className="apple-card bg-card p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-card-foreground mb-4">Income vs Expenses by Quarter</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.quarterlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="quarterLabel" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                      />
                      <Bar dataKey="income" fill="#22c55e" name="Income" />
                      <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-card-foreground mb-4">Net Profit Trend by Quarter</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.quarterlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="quarterLabel" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="net" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3} 
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h4 className="text-md font-semibold text-card-foreground mb-4">Recent Quarterly Performance</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.quarterlyData.slice(-4).map((quarter) => (
                  <div key={`${quarter.year}-Q${quarter.quarter}`} className="bg-secondary/50 rounded-lg p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">{quarter.quarterLabel}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Income:</span>
                        <span className="text-green-500">{formatCurrency(quarter.income)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Expenses:</span>
                        <span className="text-red-500">{formatCurrency(quarter.expenses)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium border-t border-border pt-1">
                        <span>Net:</span>
                        <span className={quarter.net >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {formatCurrency(quarter.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="apple-card bg-card p-6 text-center">
            <div className="text-muted-foreground">
              No quarterly data available yet. Start creating bills and expenses to see trends.
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
