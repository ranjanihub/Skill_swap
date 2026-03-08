import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

export async function POST(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const jwt = getBearerToken(req);
  if (!jwt) return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 });

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = data.user.id;

  await admin.from('google_calendar_event_links').delete().eq('user_id', userId);
  await admin.from('google_calendar_tokens').delete().eq('user_id', userId);
  await admin.from('google_calendar_connections').delete().eq('user_id', userId);

  return NextResponse.json({ ok: true });
}
