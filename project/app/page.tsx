"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import AboutSection from '@/components/about-section';
import HeroSection from '@/components/hero-section';
import HowItWorks from '@/components/how-it-works';
import { useAuth } from '@/context/auth-context';

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.push('/dashboard');
    }
  }, [loading, session, router]);

  if (!loading && session) return null;

  return (
    <main className="w-full">
      <HeroSection />
      <AboutSection />
      <HowItWorks />
    </main>
  );
}
