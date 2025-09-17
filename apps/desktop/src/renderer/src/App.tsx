import { Routes, Route, Navigate } from 'react-router-dom'
import { GlobalGate } from './components/GlobalGate'
import { Header } from './components/Header'
import DashboardPage from './pages/dashboard'
import OnboardingPage from './pages/Onboarding'
import LockPage from './pages/Lock'
import ClientsPage from './pages/clients'
import ClientsNewPage from './pages/clients/New'
import ClientsEditPage from './pages/clients/Edit'
import BillsPage from './pages/bills'
import BillsNewPage from './pages/bills/New'
import BillsEditPage from './pages/bills/Edit'
import ExpensesPage from './pages/expenses'
import SettingsPage from './pages/settings'
import SettingsMyDataPage from './pages/settings/MyData'
import AutomationPage from './pages/automation'

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalGate>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/lock" element={<LockPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/*" element={
            <div>
              <Header />
              <main className="w-full px-6">
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/new" element={<ClientsNewPage />} />
                  <Route path="/clients/:id" element={<ClientsEditPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/bills/new" element={<BillsNewPage />} />
                  <Route path="/bills/:id" element={<BillsEditPage />} />
                  <Route path="/expenses" element={<ExpensesPage />} />
                  <Route path="/automation" element={<AutomationPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/settings/my-data" element={<SettingsMyDataPage />} />
                </Routes>
              </main>
            </div>
          } />
        </Routes>
      </GlobalGate>
    </div>
  )
}

export default App
