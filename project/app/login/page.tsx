'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithGoogle, resendSignupConfirmation, configError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [canResend, setCanResend] = useState(false);

  const validateForm = () => {
    if (!email) {
      setError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    if (!password) {
      setError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setCanResend(false);

    if (configError) {
      setError(configError);
      return;
    }

    if (!validateForm()) return;

    try {
      setLoading(true);
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Login failed. Please try again.';

      // Supabase commonly returns "Invalid login credentials" when the user exists
      // but hasn't confirmed their email yet (depending on auth settings).
      const maybeNeedsConfirmation =
        /invalid login credentials/i.test(errorMessage) ||
        /email.*not.*confirmed/i.test(errorMessage) ||
        /confirm.*your.*email/i.test(errorMessage);

      setError(errorMessage);
      if (maybeNeedsConfirmation) {
        setInfo(
          'If you just signed up, you may need to confirm your email before logging in. Check your inbox (and spam) or resend the confirmation email.'
        );
        setCanResend(Boolean(email.trim()));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setError('');
    setInfo('');

    try {
      setLoading(true);
      await resendSignupConfirmation(email);
      setInfo('Confirmation email sent. Please check your inbox (and spam).');
      setCanResend(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to resend confirmation email.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Google sign-in failed';
      setError(errorMessage);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 via-skillswap-50 to-skillswap-200 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-xl p-8 sm:p-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-skillswap-dark mb-2">
              Welcome Back
            </h1>
            <p className="text-skillswap-600">
              Sign in to your SkillSwap account
            </p>
          </div>

          {(configError || error) && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3">
              <p className="text-sm text-destructive">{configError || error}</p>
              {info && <p className="text-sm text-skillswap-600">{info}</p>}
              {canResend && !configError && (
                <Button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={loading || googleLoading || !email}
                  variant="outline"
                  className="border-skillswap-200 text-skillswap-600 hover:bg-skillswap-50"
                >
                  Resend confirmation email
                </Button>
              )}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-skillswap-dark mb-2"
              >
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                className="w-full border-skillswap-200 focus:border-skillswap-500 focus:ring-skillswap-500"
                aria-label="Email address"
                disabled={loading || googleLoading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-skillswap-dark mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="w-full border-skillswap-200 focus:border-skillswap-500 focus:ring-skillswap-500 pr-10"
                  aria-label="Password"
                  disabled={loading || googleLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-skillswap-600 hover:text-skillswap-700 transition-colors"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  disabled={loading || googleLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) =>
                    setRememberMe(checked as boolean)
                  }
                  disabled={loading || googleLoading}
                  aria-label="Remember me"
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-skillswap-600 cursor-pointer"
                >
                  Remember me
                </label>
              </div>
              <Link
                href="/forgot-password"
                className="text-sm text-skillswap-500 hover:text-skillswap-600 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading || googleLoading || Boolean(configError)}
              className="w-full bg-skillswap-cta text-white hover:bg-skillswap-700 py-6 text-base font-semibold transition-all duration-300 shadow-lg hover:shadow-skillswap-cta/30 focus-visible:ring-skillswap-cta disabled:opacity-75 disabled:cursor-not-allowed"
              aria-label="Sign in with email and password"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="my-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-skillswap-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-card text-skillswap-600">Or</span>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading || Boolean(configError)}
            className="w-full border-2 border-skillswap-200 text-skillswap-dark hover:bg-skillswap-50 py-6 text-base font-semibold transition-all duration-300 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            aria-label="Sign in with Google"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </Button>

          <p className="mt-6 text-center text-sm text-skillswap-600">
            Don't have an account?{' '}
            <Link
              href="/signup"
              className="font-semibold text-skillswap-500 hover:text-skillswap-600 transition-colors"
            >
              Sign up here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
