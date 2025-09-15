'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function navItemClass(isActive: boolean) {
  return isActive
    ? 'btn btn-sm btn-primary no-underline'
    : 'btn btn-sm btn-ghost no-underline'
}

export function Header() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href

  return (
    <header className="sticky top-0 z-40 w-full bg-background border-b border-border">
      <div className="container mx-auto flex h-16 items-center px-6">
        <div className="mr-8 flex items-center">
          <img src="/logo.png" alt="Logo" className="h-8 w-8" />
        </div>
        <nav className="flex items-center space-x-6">
          <Link href="/dashboard" className={navItemClass(isActive('/dashboard'))}>Dashboard</Link>
          <Link href="/clients" className={navItemClass(isActive('/clients'))}>Clients</Link>
          <Link href="/bills" className={navItemClass(isActive('/bills'))}>Orders</Link>
          <Link href="/expenses" className={navItemClass(isActive('/expenses'))}>Products</Link>
        </nav>
        <div className="ml-auto flex items-center space-x-4">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
            <Link href="/settings/my-data" className="no-underline">JM</Link>
          </div>
        </div>
      </div>
    </header>
  )
}


