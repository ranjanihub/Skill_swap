'use client';

import { Card } from '@/components/ui/card';

export default function HowItWorks() {
  const steps = [
    {
      id: 1,
      title: 'Create Your Profile',
      description:
        'Sign up and list what you can teach and what you want to learn. You can be a learner and a mentor at the same time.',
    },
    {
      id: 2,
      title: 'Get Matched',
      description:
        'Find people with complementary skills, goals, and availability. Connect with the right partner for a two-way swap.',
    },
    {
      id: 3,
      title: 'Book & Swap Sessions',
      description:
        'Schedule focused 15–60 minute sessions, chat in-app, and share an external call link if you want to meet live. Leave feedback to build trust.',
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-24 bg-background"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl sm:text-5xl font-bold text-skillswap-dark text-center">
          How It Works
        </h2>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((step) => (
            <Card
              key={step.id}
              className="bg-card border-2 border-skillswap-500/70 shadow-sm"
            >
              <div className="p-8 text-center">
                <div className="mx-auto h-16 w-16 rounded-full border border-skillswap-800 bg-background" />
                <h3 className="mt-6 text-lg font-bold text-skillswap-dark">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm text-skillswap-dark leading-relaxed">
                  {step.description}
                </p>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="text-sm font-semibold text-skillswap-dark">
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
            className="mt-5 inline-flex items-center justify-center h-10 px-10 rounded-md bg-gradient-to-r from-skillswap-dark to-skillswap-500 text-white text-xs font-semibold hover:from-skillswap-800 hover:to-skillswap-600"
            aria-label="Get started with SkillSwap from how it works section"
          >
            Get Started
          </button>
        </div>
      </div>
    </section>
  );
}
