import { Link, useNavigate } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  rightSlot?: React.ReactNode
}

export function PageHeader({ title, subtitle, backHref, rightSlot }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center justify-between space-y-2 pb-6">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center space-x-2">
        {rightSlot}
      </div>
    </div>
  )
}
