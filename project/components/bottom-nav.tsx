"use client";

import Link from 'next/link';
import { Home, Users, CalendarDays, Bell, UserCircle } from 'lucide-react';

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 h-16 bg-white border-t border-skillswap-200 flex items-center justify-around px-4 sm:px-8 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Link className="bottom-nav-item text-skillswap-500" aria-label="Home" title="Home" href="/">
        <Home className="h-5 w-5" />
        <span className="text-[11px]">Home</span>
      </Link>

      <Link className="bottom-nav-item" aria-label="My Network" title="My Network" href="/network">
        <Users className="h-5 w-5" />
        <span className="text-[11px]">My Network</span>
      </Link>

      <Link className="bottom-nav-item" aria-label="Calender" title="Calender" href="/calendar">
        <CalendarDays className="h-5 w-5" />
        <span className="text-[11px]">Calender</span>
      </Link>

      <Link className="bottom-nav-item" aria-label="Notification" title="Notification" href="/notifications">
        <Bell className="h-5 w-5" />
        <span className="text-[11px]">Notification</span>
      </Link>

      <Link className="bottom-nav-item" aria-label="Profile" title="Profile" href="/dashboard/settings">
        <UserCircle className="h-5 w-5" />
        <span className="text-[11px]">Profile</span>
      </Link>
    </nav>
  );
}
