import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If Supabase isn't configured, return an empty list so the UI doesn't show
    // dev placeholder names.
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json([]);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Get all skills where users want to learn
    const { data: learnSkills, error: learnError } = await supabase
      .from('skills')
      .select('id, name, user_id')
      .eq('skill_type', 'learn');

    if (learnError) {
      return NextResponse.json({ error: learnError.message }, { status: 500 });
    }

    if (!learnSkills || learnSkills.length === 0) {
      return NextResponse.json([]);
    }

    const uniqueNames = Array.from(new Set(learnSkills.map((s) => s.name)));

    // Get all teach skills that match any of the learn skill names
    const { data: teachSkills, error: teachError } = await supabase
      .from('skills')
      .select('id, name, user_id')
      .eq('skill_type', 'teach')
      .in('name', uniqueNames);

    if (teachError) {
      return NextResponse.json({ error: teachError.message }, { status: 500 });
    }

    const matches: Array<Record<string, any>> = [];

    // Build pairings: each learn skill paired with all teach skills with the same name (excluding same user)
    for (const learn of learnSkills) {
      for (const teach of teachSkills || []) {
        if (learn.name === teach.name && learn.user_id !== teach.user_id) {
          matches.push({
            skill: learn.name,
            learner_id: learn.user_id,
            teacher_id: teach.user_id,
            learn_skill_id: learn.id,
            teach_skill_id: teach.id,
          });
        }
      }
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json([]);
    }

    // attach teacher profile data for all matches so client can render the name directly
    const teacherIds = Array.from(new Set(matches.map((m) => m.teacher_id))).filter(Boolean);
    if (teacherIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name, bio')
        .in('id', teacherIds);
      if (!profilesError && profilesData) {
        const map: Record<string, any> = {};
        profilesData.forEach((p: any) => (map[p.id] = p));
        matches.forEach((m) => {
          m.teacher = map[m.teacher_id] || null;
        });
      }

      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('id, headline, current_title, current_company, avatar_url, display_name, username')
        .in('id', teacherIds);
      if (!settingsError && settingsData) {
        const sMap: Record<string, any> = {};
        settingsData.forEach((s: any) => (sMap[s.id] = s));
        matches.forEach((m) => {
          m.teacher_settings = sMap[m.teacher_id] || m.teacher_settings || null;
        });
      }
    }

    return NextResponse.json(matches);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}