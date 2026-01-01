import Link from 'next/link';

import AboutSection from '@/components/about-section';
import HeroSection from '@/components/hero-section';
import HowItWorks from '@/components/how-it-works';

export default function Home() {
  return (
    <main className="w-full">
      <HeroSection />
      <AboutSection />
      <HowItWorks />
    </main>
  );
}
