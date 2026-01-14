'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return (
    <header className="w-full border-b border-skillswap-800 bg-skillswap-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <Link
          href="/"
          className="relative h-10 w-44"
          aria-label="SkillSwap home"
        >
          <Image
            src="/SkillSwap_Logo.jpg"
            alt="SkillSwap"
            fill
            priority
            className="object-contain"
            sizes="176px"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-skillswap-dark">
          <Link href="/" className="hover:underline underline-offset-4">
            Home
          </Link>
          <Link href="/#about" className="hover:underline underline-offset-4">
            About
          </Link>
          <Link href="/explore" className="hover:underline underline-offset-4">
            Explore Skills
          </Link>
          <Link href="/#how-it-works" className="hover:underline underline-offset-4">
            How It Works
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <Button
                asChild
                variant="outline"
                className="border-skillswap-800 text-skillswap-dark hover:bg-skillswap-100"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button
                onClick={handleSignOut}
                className="bg-skillswap-dark text-white hover:bg-skillswap-800"
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button
              asChild
              className={cn(
                'bg-gradient-to-r from-skillswap-dark to-skillswap-500 text-white hover:from-skillswap-800 hover:to-skillswap-600',
                loading && 'from-skillswap-800 to-skillswap-600'
              )}
              disabled={loading}
              aria-busy={loading}
            >
              <Link href="/login">Login / Sign Up</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
