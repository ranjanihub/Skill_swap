'use client';

import { usePathname } from 'next/navigation';

import { Navbar } from '@/components/navbar';

export default function NavbarWrapper() {
  const pathname = usePathname();

  // The dashboard has its own shell (sidebar + top bar) per Figma.
  // Hide navbar for dashboard and for standalone auth pages/modal routes.
  if (pathname?.startsWith('/dashboard')) return null;
  if (pathname === '/') return null;
  if (pathname === '/messages') return null;
  if (pathname === '/network') return null;
  if (pathname === '/notifications') return null;
  if (pathname === '/calendar') return null;
  if (pathname === '/login' || pathname === '/signup') return null;

  return <Navbar />;
}
