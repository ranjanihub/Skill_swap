import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
