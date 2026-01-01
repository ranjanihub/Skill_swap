'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const run = async () => {
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

      router.replace('/dashboard');
    };

    void run();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-skillswap-dark">{message}</p>
    </div>
  );
}
