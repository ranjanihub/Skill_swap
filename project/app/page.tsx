"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import AboutSection from '@/components/about-section';
import HeroSection from '@/components/hero-section';
import HowItWorks from '@/components/how-it-works';
import { useAuth } from '@/context/auth-context';
import AppShell, { type ShellNavItem } from '@/components/app-shell';
import { Compass, Home as HomeIcon, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore Skills', icon: Compass },
  ];

  useEffect(() => {
    if (!loading && session) {
      router.push('/dashboard');
    }
  }, [loading, session, router]);

  if (!loading && session) return null;

  return (
    <AppShell
      nav={publicNav}
      bottomActions={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push('/login')}
          className="text-skillswap-600 hover:bg-skillswap-50"
          aria-label="Login"
          title="Login"
        >
          <LogIn className="h-5 w-5" />
        </Button>
      }
      headerLeft={
        <>
          <p className="text-sm sm:text-base font-semibold text-skillswap-dark truncate">
            Welcome to SkillSwap
          </p>
          <p className="text-xs text-skillswap-600 truncate">Exchange skills through focused sessions</p>
        </>
      }
    >
      <main className="w-full">
        <HeroSection />
        <AboutSection />
        <HowItWorks />
      </main>
    </AppShell>
  );
}
