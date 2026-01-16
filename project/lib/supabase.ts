import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseConfigError = isSupabaseConfigured
  ? null
  : 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment (for local dev, put them in .env.local).';

export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key'
);

export type UserProfile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  swap_points: number;
  skills_count: number;
  created_at: string;
  updated_at: string;
};

export type Skill = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  skill_type: 'teach' | 'learn';
  proficiency_level: 'beginner' | 'intermediate' | 'advanced';
  created_at: string;
  updated_at: string;
};

export type SkillSwapSession = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  skill_a_id: string;
  skill_b_id: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
};

export type ConnectionRequest = {
  id: string;
  requester_id: string;
  recipient_id: string;
  skill_id: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
};

export type Conversation = {
  id: string;
  participant_a: string;
  participant_b: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, any> | null;
  read: boolean;
  created_at: string;
};

export type UserSettings = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  location?: string | null;
  timezone?: string | null;
  teaching_level?: 'beginner' | 'intermediate' | 'advanced' | null;
  learning_level?: 'beginner' | 'intermediate' | 'advanced' | null;
  categories?: string[] | null;
  max_active_exchanges?: number | null;
  availability?: Record<string, any> | null;
  session_duration_minutes?: number | null;
  learning_modes?: string[] | null;
  buffer_minutes?: number | null;
  notifications?: Record<string, any> | null;
  privacy?: Record<string, any> | null;
  two_factor_enabled?: boolean | null;
  /* Extended profile fields (LinkedIn-like) */
  headline?: string | null;
  industry?: string | null;
  current_title?: string | null;
  current_company?: string | null;
  company_website?: string | null;
  websites?: string[] | null;
  phone?: string | null;
  birthday?: string | null;
  languages?: string[] | null;
  experience?: Array<Record<string, any>> | string[] | null;
  education?: Array<Record<string, any>> | string[] | null;
  certifications?: string[] | null;
  licenses?: string[] | null;
  projects?: string[] | null;
  publications?: string[] | null;
  skills?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};
