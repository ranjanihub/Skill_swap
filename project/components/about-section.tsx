'use client';

import { Card } from '@/components/ui/card';

export default function AboutSection() {
  return (
    <section id="about" className="py-20 sm:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl sm:text-5xl font-bold text-skillswap-dark mb-10">
          About SkillSwap
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="w-full max-w-md">
            <div className="h-44 w-44 rounded-lg bg-white border border-skillswap-200" />
          </div>

          <div className="text-skillswap-dark">
            <p className="text-base sm:text-lg leading-relaxed">
              <span className="font-bold">SkillSwap</span> is a peer-to-peer learning platform built
              on the belief that everyone has something valuable to teach — and something new to
              learn.
            </p>

            <p className="mt-6 text-base sm:text-lg leading-relaxed">
              In a world where education often feels expensive, one-sided, or inaccessible,
              <span className="font-bold"> SkillSwap</span> creates a space where knowledge flows
              freely through collaboration. Instead of paying with money, users exchange skills,
              time, and experience — turning learning into a shared journey.
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-10">
          <Card className="border-2 border-skillswap-500/70 bg-card shadow-sm">
            <div className="p-8">
              <h3 className="text-3xl font-bold text-skillswap-dark mb-4 text-center">
                Our Vision
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-skillswap-dark">
                <li>We envision a world where learning is not limited by cost, background, or formal titles.</li>
                <li>A world where people grow by helping each other grow.</li>
                <li>SkillSwap exists to make learning more human, accessible, and meaningful.</li>
              </ul>
            </div>
          </Card>

          <Card className="border-2 border-skillswap-500/70 bg-card shadow-sm">
            <div className="p-8">
              <h3 className="text-3xl font-bold text-skillswap-dark mb-4 text-center">
                Our Mission
              </h3>
              <p className="text-skillswap-dark leading-relaxed">
                To create a global learning community where skills are exchanged freely, growth is
                collaborative, and everyone has the opportunity to learn, teach, and connect.
              </p>
              <p className="mt-4 text-skillswap-dark font-semibold text-center">
                “When we share what we know, we grow together.”
              </p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
