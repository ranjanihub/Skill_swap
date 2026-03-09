'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, supabaseConfigError, UserSettings } from '@/lib/supabase';

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
    // When a user signs in or we load an existing session we want to
    // make sure we have a profile/settings row for them.  Google OAuth
    // users often have a display name/avatar in the auth metadata, so
    // we copy those values into our own tables as defaults when the
    // rows are first created.  That way other users can see the avatar
    // when they view a profile, and the values can be overridden later
    // by the user.
    const applyGoogleDefaults = async (user: User | null) => {
      if (!user) return;
      try {
        // user_profiles.full_name
        const { data: existingProfile, error: profileErr } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        if (profileErr) throw profileErr;
        if (!existingProfile) {
          await supabase.from('user_profiles').insert({
            id: user.id,
            full_name: (user.user_metadata?.full_name as string) || null,
          });
        } else if (!existingProfile.full_name && user.user_metadata?.full_name) {
          await supabase
            .from('user_profiles')
            .update({ full_name: user.user_metadata.full_name })
            .eq('id', user.id);
        }

        // user_settings.avatar_url and display_name
        const { data: existingSettings, error: settingsErr } = await supabase
          .from('user_settings')
          .select('avatar_url, display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (settingsErr) throw settingsErr;
        if (!existingSettings) {
          await supabase.from('user_settings').insert({
            id: user.id,
            avatar_url: (user.user_metadata?.avatar_url as string) || null,
            display_name: (user.user_metadata?.full_name as string) || null,
          });
        } else {
          const patch: Partial<UserSettings> = {};
          if (!existingSettings.avatar_url && user.user_metadata?.avatar_url) {
            patch.avatar_url = user.user_metadata.avatar_url as string;
          }
          if (!existingSettings.display_name && user.user_metadata?.full_name) {
            patch.display_name = user.user_metadata.full_name as string;
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from('user_settings').update(patch).eq('id', user.id);
          }
        }
      } catch (err) {
        console.warn('applyGoogleDefaults error', err);
      }
    };

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
        // Don't block the entire app on profile/settings enrichment.
        // If the DB is slow/misconfigured, we'd otherwise keep showing a spinner everywhere.
        void applyGoogleDefaults(data.session?.user ?? null);
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
      // each time auth state changes we should re-run the defaults
      void applyGoogleDefaults(session?.user ?? null);
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
