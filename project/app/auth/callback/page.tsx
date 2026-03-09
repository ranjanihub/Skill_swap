'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { isSupabaseConfigured, supabase, supabaseConfigError } from '@/lib/supabase';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const run = async () => {
      if (!isSupabaseConfigured) {
        setMessage(supabaseConfigError ?? 'Supabase is not configured');
        return;
      }

      const errorDescription = searchParams.get('error_description');
      if (errorDescription) {
        setMessage(errorDescription);
        setTimeout(() => router.replace('/login'), 1200);
        return;
      }

      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage('Google sign-in failed. Redirecting to login...');
          setTimeout(() => router.replace('/login'), 1200);
          return;
        }
      }

      router.replace('/');
    };

    void run();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-skillswap-dark">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-skillswap-dark">Completing sign in...</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
