import { Link, useLocation } from "react-router-dom";
import logoUrl from "../../logo.png";

interface SideNavigationProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function navItemClass(isActive: boolean, isCollapsed: boolean) {
  const baseClass = isActive
    ? "flex items-center py-1 rounded-lg bg-primary text-primary-foreground font-medium h-8"
    : "flex items-center py-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors h-8";
  
  return isCollapsed 
    ? `${baseClass} pl-2`
    : `${baseClass} px-2 space-x-2`;
}

const navigationItems = [
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" strokeWidth={2} />
        <rect x="14" y="3" width="7" height="7" strokeWidth={2} />
        <rect x="14" y="14" width="7" height="7" strokeWidth={2} />
        <rect x="3" y="14" width="7" height="7" strokeWidth={2} />
      </svg>
    )
  },
  {
    path: "/clients",
    label: "Clients",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" strokeWidth={2} />
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" strokeWidth={2} />
      </svg>
    )
  },
  {
    path: "/bills",
    label: "Income",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <line x1="12" y1="2" x2="12" y2="22" strokeWidth={2} />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeWidth={2} />
      </svg>
    )
  },
  {
    path: "/expenses",
    label: "Expenses",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <line x1="5" y1="12" x2="19" y2="12" strokeWidth={2} />
      </svg>
    )
  },
  {
    path: "/automation",
    label: "Automation",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" strokeWidth={2} />
        <line x1="12" y1="2" x2="12" y2="8" strokeWidth={2} />
        <line x1="12" y1="16" x2="12" y2="22" strokeWidth={2} />
        <line x1="2" y1="12" x2="8" y2="12" strokeWidth={2} />
        <line x1="16" y1="12" x2="22" y2="12" strokeWidth={2} />
      </svg>
    )
  }
];

export function SideNavigation({ isCollapsed, onToggleCollapse }: SideNavigationProps) {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  return (
    <div className={`fixed left-0 top-10 h-screen bg-background z-40 ${
      isCollapsed ? 'w-17' : 'w-64 transition-all duration-300 ease-in-out'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header with Logo and Toggle */}
        <button onClick={onToggleCollapse} className="flex items-center justify-between p-4 ">
          <div className={`flex items-start ${
            isCollapsed ? 'w-0 overflow-hidden' : 'ml-[2.2px]'
          }`}>
            <img src={logoUrl} alt="Logo" className="h-8 w-8" />
          </div>
          
          {isCollapsed && (
            <div  className="flex justify-center w-full">
              <img src={logoUrl} alt="Logo" className="h-8 w-8" />
            </div>
          )}
          
        </button>

        {/* Navigation Items */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            {navigationItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={navItemClass(isActive(item.path), isCollapsed)}
                title={isCollapsed ? item.label : undefined}
              >
                <div className="flex-shrink-0">
                  {item.icon}
                </div>
                {!isCollapsed && (
                  <span className="transition-opacity duration-300">
                    {item.label}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
