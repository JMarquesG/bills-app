import { Routes, Route, Navigate } from 'react-router-dom'
import { GlobalGate } from './components/GlobalGate'
import { Header } from './components/Header'
import DashboardPage from './pages/Dashboard'
import OnboardingPage from './pages/Onboarding'
import LockPage from './pages/Lock'
import ClientsPage from './pages/Clients'
import BillsPage from './pages/Bills'
import ExpensesPage from './pages/Expenses'
import SettingsPage from './pages/Settings'

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
              <main className="mx-auto max-w-7xl px-4">
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/expenses" element={<ExpensesPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
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
