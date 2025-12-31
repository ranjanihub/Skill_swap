'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin"></div>
          <p className="text-skillswap-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return children;
}
