import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

export async function GET(req: Request, { params }: { params: { id?: string } }) {
  const { id } = params || {};
  if (!id) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
  }

  // require the caller to be authenticated
  const jwt = getBearerToken(req);
  if (!jwt) {
    return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: userResp, error } = await admin.auth.admin.getUserById(id);
    if (error) throw error;
    const meta = userResp?.user?.user_metadata || {};
    return NextResponse.json({
      full_name: meta.full_name || null,
      avatar_url: meta.avatar_url || null,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
