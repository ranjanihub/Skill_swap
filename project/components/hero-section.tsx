'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function HeroSection() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleGetStarted = async () => {
    try {
      setIsNavigating(true);
      router.push('/signup');
    } catch (error) {
      console.error('Navigation error:', error);
      setIsNavigating(false);
    }
  };

  const handleLearnMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const element = document.getElementById('how-it-works');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="relative py-20 sm:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center justify-center px-6 py-2 rounded-full border border-skillswap-800 bg-background text-xs sm:text-sm text-skillswap-dark mb-6">
          Peer-to-Peer Learning Platform
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-skillswap-dark leading-tight">
          Exchange Skills,
          <br />
          Unlock Potential
        </h1>

        <p className="mt-6 text-sm sm:text-base text-skillswap-dark max-w-2xl mx-auto leading-relaxed">
          Connect with learners worldwide to trade knowledge and master new skills. From coding to
          cooking, teaching to design—your expertise is valuable, and someone wants to learn it.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            variant="outline"
            className="border-skillswap-800 text-skillswap-dark hover:bg-skillswap-100 px-10"
            aria-label="Get started with SkillSwap"
            onClick={handleGetStarted}
            disabled={isNavigating}
          >
            Get Started
          </Button>

          <Button
            size="lg"
            className="bg-skillswap-dark text-white hover:bg-skillswap-800 px-10"
            aria-label="Learn more about SkillSwap"
            onClick={handleLearnMore}
          >
            Learn More
          </Button>
        </div>
      </div>
    </section>
  );
}
