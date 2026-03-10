import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

/**
 * Returns the display name and avatar for a user with a 3-tier fallback:
 *   1. Custom values from user_settings / user_profiles (user-uploaded)
 *   2. Google account metadata from the auth provider
 *   3. Placeholder defaults ("User" / null)
 */
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
    // --- Tier 1: custom values from the DB tables ---
    const [settingsRes, profileRes] = await Promise.all([
      admin.from('user_settings').select('avatar_url, display_name').eq('id', id).maybeSingle(),
      admin.from('user_profiles').select('full_name').eq('id', id).maybeSingle(),
    ]);

    const dbAvatar = settingsRes.data?.avatar_url || null;
    const dbName = settingsRes.data?.display_name || profileRes.data?.full_name || null;

    // --- Tier 2: Google / OAuth provider metadata ---
    let providerAvatar: string | null = null;
    let providerName: string | null = null;
    const { data: userResp } = await admin.auth.admin.getUserById(id);
    const meta = userResp?.user?.user_metadata || {};
    providerAvatar = (meta.avatar_url as string) || null;
    providerName = (meta.full_name as string) || null;

    // --- Resolve with priority: custom → provider → placeholder ---
    return NextResponse.json({
      full_name: dbName || providerName || 'User',
      avatar_url: dbAvatar || providerAvatar || null,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
