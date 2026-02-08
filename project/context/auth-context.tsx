'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '@/lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configError: string | null;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: string
  ) => Promise<{ signedIn: boolean }>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resendSignupConfirmation: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(supabaseConfigError);

  useEffect(() => {
    const initializeAuth = async () => {
      if (!isSupabaseConfigured) {
        setConfigError(supabaseConfigError);
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (error) {
        console.error('Failed to get session:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    if (!isSupabaseConfigured) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: string
  ) => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured');
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });
    if (error) throw error;

    const { data } = await supabase.auth.getSession();
    return { signedIn: Boolean(data.session) };
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured');
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured');
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  };

  const resendSignupConfirmation = async (email: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured');
    }

    const safeEmail = email.trim();
    if (!safeEmail) {
      throw new Error('Email is required');
    }

    // Supabase will only send this if email confirmations are enabled.
    const { error } = await supabase.auth.resend({ type: 'signup', email: safeEmail });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        configError,
        signUp,
        signIn,
        signOut,
        signInWithGoogle,
        resendSignupConfirmation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
