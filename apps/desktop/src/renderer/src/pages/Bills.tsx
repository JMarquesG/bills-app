import { PageHeader } from '../components/PageHeader'

export default function BillsPage() {
  return (
    <div className="container mx-auto py-6">
      <PageHeader 
        title="Orders" 
        subtitle="Manage your billing and invoices" 
      />
      
      <div className="apple-card bg-card p-8 text-center">
        <h3 className="text-lg font-semibold text-card-foreground mb-2">
          Coming Soon
        </h3>
        <p className="text-muted-foreground">
          Invoice management features will be available in a future update.
        </p>
      </div>
    </div>
  )
}
