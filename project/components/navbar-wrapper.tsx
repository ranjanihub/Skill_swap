'use client';

import { usePathname } from 'next/navigation';

import { Navbar } from '@/components/navbar';

export default function NavbarWrapper() {
  const pathname = usePathname();

  // The dashboard has its own shell (sidebar + top bar) per Figma.
  if (pathname?.startsWith('/dashboard')) return null;

  return <Navbar />;
}
