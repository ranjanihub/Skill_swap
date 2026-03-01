"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

type Unread = {
  messages: number;
  notifications: number;
  requests: number;
};

type NotificationsContextValue = {
  unread: Unread;
  setUnread: (u: Unread) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState<Unread>({ messages: 0, notifications: 0, requests: 0 });

  useEffect(() => {
    // Placeholder: fetch unread counts from backend or subscribe to realtime updates.
    // Keep defaults until backend wiring is added.
  }, []);

  return (
    <NotificationsContext.Provider value={{ unread, setUnread }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    return { unread: { messages: 0, notifications: 0, requests: 0 }, setUnread: () => {} } as NotificationsContextValue;
  }
  return ctx;
}

export default NotificationsProvider;
