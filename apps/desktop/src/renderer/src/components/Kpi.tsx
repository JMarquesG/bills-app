interface KpiProps {
  label: string
  value: string
  currency?: string
}

export function Kpi({ label, value, currency }: KpiProps) {
  return (
    <div className="apple-card bg-card  p-6 min-w-[180px] group">
      <div className="text-sm text-muted-foreground mb-3 font-medium">
        {label}
      </div>
      <div className="text-2xl font-bold text-card-foreground group-hover:text-primary transition-colors">
        {currency && <span className="text-muted-foreground">{currency} </span>}{value}
      </div>
    </div>
  )
}
