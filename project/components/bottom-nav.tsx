"use client";

import Link from 'next/link';
import { Home, Users, CalendarDays, MessageSquare, UserCircle } from 'lucide-react';
import { useNotifications } from '@/context/notification-context';

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

      <Link className="bottom-nav-item" aria-label="Messages" title="Messages" href="/messages">
        <div className="relative">
          <MessageSquare className="h-5 w-5" />
          {(() => {
            try {
              const { unread } = useNotifications();
              if (unread.messages > 0) return <span className="absolute -top-2 -right-3 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />;
            } catch (e) {
              return null;
            }
            return null;
          })()}
        </div>
        <span className="text-[11px]">Messages</span>
      </Link>

      <Link className="bottom-nav-item" aria-label="Profile" title="Profile" href="/dashboard/settings">
        <UserCircle className="h-5 w-5" />
        <span className="text-[11px]">Profile</span>
      </Link>
    </nav>
  );
}
