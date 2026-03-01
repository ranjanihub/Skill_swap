import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // Get all skills where users want to learn
    const { data: learnSkills, error: learnError } = await supabase
      .from('skills')
      .select('id, name, user_id')
      .eq('skill_type', 'learn');

    if (learnError) {
      return NextResponse.json({ error: learnError.message }, { status: 500 });
    }

    if (!learnSkills || learnSkills.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        const sample = [
          {
            skill: 'Data analysis',
            learner_id: 'dev-learner-1',
            teacher_id: 'dev-teacher-1',
            learn_skill_id: 'dev-learn-1',
            teach_skill_id: 'dev-teach-1',
            teacher: { full_name: 'Dev Teacher 1', bio: '' },
            teacher_settings: { headline: 'Data analyst', current_title: null, current_company: null },
          },
          {
            skill: 'UI/UX',
            learner_id: 'dev-learner-2',
            teacher_id: 'dev-teacher-2',
            learn_skill_id: 'dev-learn-2',
            teach_skill_id: 'dev-teach-2',
            teacher: { full_name: 'Dev Teacher 2', bio: '' },
            teacher_settings: { headline: 'UX designer', current_title: null, current_company: null },
          },
        ];
        return NextResponse.json(sample);
      }
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

    // If there are no matches in the database, return a small dev-only sample
    if ((!matches || matches.length === 0) && process.env.NODE_ENV !== 'production') {
      const sample = [
        {
          skill: 'Data analysis',
          learner_id: 'dev-learner-1',
          teacher_id: 'dev-teacher-1',
          learn_skill_id: 'dev-learn-1',
          teach_skill_id: 'dev-teach-1',
          teacher: { full_name: 'Dev Teacher 1', bio: '' },
          teacher_settings: { headline: 'Data analyst', current_title: null, current_company: null },
        },
        {
          skill: 'UI/UX',
          learner_id: 'dev-learner-2',
          teacher_id: 'dev-teacher-2',
          learn_skill_id: 'dev-learn-2',
          teach_skill_id: 'dev-teach-2',
          teacher: { full_name: 'Dev Teacher 2', bio: '' },
          teacher_settings: { headline: 'UX designer', current_title: null, current_company: null },
        },
      ];
      return NextResponse.json(sample);
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
    }

    return NextResponse.json(matches);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}