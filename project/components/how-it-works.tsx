'use client';

import { UserPlus, ListChecks, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function HowItWorks() {
  const steps = [
    {
      id: 1,
      icon: UserPlus,
      title: 'Create Your Profile',
      description:
        'Sign up and build your profile by highlighting your unique skills and interests. Tell the community what you excel at and what you want to learn.',
    },
    {
      id: 2,
      icon: ListChecks,
      title: 'List Skills to Teach & Learn',
      description:
        'Add the skills you\'d like to share with others and the ones you\'re eager to master. Connect with peers who share your learning goals.',
    },
    {
      id: 3,
      icon: Zap,
      title: 'Swap Sessions Seamlessly',
      description:
        'Schedule sessions with your matched peers, exchange knowledge in real-time, and grow together. Track progress and build lasting connections.',
    },
  ];

  return (
    <section
      id="how-it-works"
      className="relative py-20 sm:py-24 lg:py-32 bg-white overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-skillswap-100/30 to-transparent pointer-events-none"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 sm:mb-20">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-skillswap-dark mb-4 leading-tight">
            How It Works
          </h2>
          <p className="text-lg sm:text-xl text-skillswap-600 max-w-3xl mx-auto">
            Get started in three simple steps and begin your journey of skill exchange
            with our thriving community of learners.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, index) => {
            const IconComponent = step.icon;
            return (
              <div
                key={step.id}
                className="group relative flex flex-col h-full"
              >
                <Card className="flex flex-col h-full p-8 sm:p-10 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-all duration-300 hover:shadow-lg hover:shadow-skillswap-300/20 hover:transform hover:-translate-y-2">
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-skillswap-300 to-skillswap-400 group-hover:from-skillswap-400 group-hover:to-skillswap-500 transition-all duration-300 shadow-lg">
                        <IconComponent className="w-8 h-8 text-skillswap-900" />
                      </div>
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-skillswap-100 text-skillswap-600 font-bold text-lg group-hover:bg-skillswap-200 transition-all duration-300">
                        {index + 1}
                      </div>
                    </div>

                    <h3 className="text-2xl sm:text-xl lg:text-2xl font-bold text-skillswap-dark mb-4 leading-tight">
                      {step.title}
                    </h3>

                    <p className="text-base sm:text-sm lg:text-base text-skillswap-600 leading-relaxed flex-grow">
                      {step.description}
                    </p>

                    <div className="mt-6 h-1 w-12 bg-gradient-to-r from-skillswap-400 to-skillswap-500 group-hover:w-full transition-all duration-300 rounded-full"></div>
                  </div>

                  {index < steps.length - 1 && (
                    <div className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-20">
                      <svg
                        className="w-12 h-12 text-skillswap-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  )}
                </Card>

                {index < steps.length - 1 && (
                  <div className="md:hidden h-6 flex justify-center my-4">
                    <svg
                      className="w-6 h-6 text-skillswap-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-16 sm:mt-20 text-center">
          <p className="text-lg text-skillswap-600 mb-6">
            Ready to start exchanging skills?
          </p>
          <button
            onClick={() => {
              const getStartedButton = document.querySelector(
                'button[aria-label="Get started with SkillSwap"]'
              ) as HTMLButtonElement;
              if (getStartedButton) {
                getStartedButton.click();
              }
            }}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-skillswap-500 to-skillswap-600 text-skillswap-900 font-semibold rounded-lg hover:from-skillswap-600 hover:to-skillswap-700 transition-all duration-300 shadow-lg hover:shadow-skillswap-500/30 hover:scale-105 active:scale-95"
            aria-label="Get started with SkillSwap from how it works section"
          >
            Get Started Today
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
