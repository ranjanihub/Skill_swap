'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';

export function Navbar() {
  const router = useRouter();
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
    <header className="w-full border-b border-skillswap-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-bold text-xl text-skillswap-dark hover:text-skillswap-700 transition-colors"
            aria-label="SkillSwap home"
          >
            SkillSwap
          </Link>

          <nav className="hidden sm:flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-skillswap-700 hover:text-skillswap-dark transition-colors"
            >
              Home
            </Link>
            <Link
              href="/#how-it-works"
              className="text-sm font-medium text-skillswap-700 hover:text-skillswap-dark transition-colors"
            >
              How it works
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <Button
                asChild
                variant="outline"
                className="border-skillswap-200 text-skillswap-dark hover:bg-skillswap-100"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button
                onClick={handleSignOut}
                className="bg-skillswap-cta text-white hover:bg-skillswap-700"
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button
                asChild
                variant="outline"
                className={cn(
                  'border-skillswap-200 text-skillswap-dark hover:bg-skillswap-100',
                  loading && 'border-skillswap-700 text-skillswap-dark bg-skillswap-200/30'
                )}
                disabled={loading}
                aria-busy={loading}
              >
                <Link href="/login">Login</Link>
              </Button>
              <Button
                asChild
                className={cn(
                  'bg-skillswap-cta text-white hover:bg-skillswap-700',
                  loading && 'bg-skillswap-700 hover:bg-skillswap-700'
                )}
                disabled={loading}
                aria-busy={loading}
              >
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
