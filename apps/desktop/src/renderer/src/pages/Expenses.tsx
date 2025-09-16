import { PageHeader } from '../components/PageHeader'

export default function ExpensesPage() {
  return (
    <div className="container mx-auto py-6">
      <PageHeader 
        title="Products" 
        subtitle="Track and manage your business expenses" 
      />
      
      <div className="apple-card bg-card p-8 text-center">
        <h3 className="text-lg font-semibold text-card-foreground mb-2">
          Coming Soon
        </h3>
        <p className="text-muted-foreground">
          Expense tracking features will be available in a future update.
        </p>
      </div>
    </div>
  )
}
