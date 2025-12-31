'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HeroSection() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleGetStarted = async () => {
    try {
      setIsNavigating(true);
      router.push('/login');
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
    <section className="relative py-20 sm:py-24 lg:py-32 overflow-hidden bg-gradient-to-br from-skillswap-dark via-skillswap-800 to-skillswap-700">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 sm:h-28 lg:h-32 bg-gradient-to-b from-transparent to-white" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-skillswap-500/20 border border-skillswap-400/30 rounded-full mb-8 backdrop-blur-sm">
          <Zap className="w-4 h-4 text-skillswap-100" />
          <span className="text-sm font-medium text-skillswap-100">
            Peer-to-Peer Learning Platform
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
          Exchange Skills,
          <br />
          <span>
            Unlock Potential
          </span>
        </h1>

        <p className="text-lg sm:text-xl lg:text-2xl text-skillswap-200 max-w-3xl mx-auto mb-4 leading-relaxed">
          Connect with learners worldwide to trade knowledge and master new skills.
          From coding to cooking, teaching to design—your expertise is valuable,
          and someone wants to learn it.
        </p>

        <p className="text-base sm:text-lg text-skillswap-300 max-w-2xl mx-auto mb-12">
          Build meaningful connections through skill exchange. No money required—just passion,
          curiosity, and the willingness to share what you know.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Button
            size="lg"
            className="bg-skillswap-100 text-skillswap-dark hover:bg-skillswap-200 transition-all duration-500 shadow-lg hover:shadow-skillswap-100/50 hover:scale-105 font-semibold px-8 py-6 text-lg group disabled:opacity-75 disabled:cursor-not-allowed"
            aria-label="Get started with SkillSwap"
            onClick={handleGetStarted}
            disabled={isNavigating}
          >
            Get Started
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="border-2 border-skillswap-200 text-skillswap-100 hover:bg-skillswap-200/10 hover:border-skillswap-100 transition-all duration-500 font-semibold px-8 py-6 text-lg backdrop-blur-sm"
            aria-label="Learn more about SkillSwap"
            onClick={handleLearnMore}
          >
            Learn More
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="flex flex-col items-center p-6 bg-skillswap-800/50 backdrop-blur-sm rounded-xl border border-skillswap-600/30 hover:border-skillswap-400/50 transition-all duration-500 hover:transform hover:scale-105">
            <div className="w-12 h-12 bg-skillswap-500/20 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-skillswap-200" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">10,000+</h3>
            <p className="text-skillswap-300 text-sm">Active Learners</p>
          </div>

          <div className="flex flex-col items-center p-6 bg-skillswap-800/50 backdrop-blur-sm rounded-xl border border-skillswap-600/30 hover:border-skillswap-400/50 transition-all duration-500 hover:transform hover:scale-105">
            <div className="w-12 h-12 bg-skillswap-500/20 rounded-full flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-skillswap-200" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">500+</h3>
            <p className="text-skillswap-300 text-sm">Skills Available</p>
          </div>

          <div className="flex flex-col items-center p-6 bg-skillswap-800/50 backdrop-blur-sm rounded-xl border border-skillswap-600/30 hover:border-skillswap-400/50 transition-all duration-500 hover:transform hover:scale-105">
            <div className="w-12 h-12 bg-skillswap-500/20 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-skillswap-200"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">100%</h3>
            <p className="text-skillswap-300 text-sm">Free to Join</p>
          </div>
        </div>
      </div>
    </section>
  );
}
