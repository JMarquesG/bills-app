import { PageHeader } from '../components/PageHeader'

export default function ClientsPage() {
  return (
    <div className="container mx-auto py-6">
      <PageHeader 
        title="Clients" 
        subtitle="Manage your client information" 
      />
      
      <div className="apple-card bg-card p-8 text-center">
        <h3 className="text-lg font-semibold text-card-foreground mb-2">
          Coming Soon
        </h3>
        <p className="text-muted-foreground">
          Client management features will be available in a future update.
        </p>
      </div>
    </div>
  )
}
