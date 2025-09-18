import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { GlobalGate } from './components/GlobalGate'
import { Header } from './components/Header'
import { SideNavigation } from './components/SideNavigation'
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalGate>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/lock" element={<LockPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/*" element={
            <div className="flex h-screen">
              <SideNavigation 
                isCollapsed={sidebarCollapsed} 
                onToggleCollapse={handleToggleSidebar} 
              />
              <div className={`flex-1 flex flex-col transition-all duration-300 ${
                sidebarCollapsed ? 'ml-16' : 'ml-64'
              }`}>
                <Header />
                <main className="flex-1 p-6 overflow-auto">
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
            </div>
          } />
        </Routes>
      </GlobalGate>
    </div>
  )
}

export default App
