import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function asText(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export async function GET(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Missing GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET.' }, { status: 500 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code/state.' }, { status: 400 });
  }

  const { data: stateRow, error: stateErr } = await admin
    .from('google_oauth_states')
    .select('*')
    .eq('state', state)
    .maybeSingle();

  if (stateErr || !stateRow) {
    return NextResponse.json({ error: 'Invalid/expired OAuth state.' }, { status: 400 });
  }

  const redirectUri = asText(stateRow.redirect_uri);
  const codeVerifier = asText(stateRow.code_verifier);
  const userId = asText(stateRow.user_id);

  if (!redirectUri || !codeVerifier || !userId) {
    return NextResponse.json({ error: 'OAuth state row incomplete.' }, { status: 500 });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  const tokenJson = await tokenRes.json().catch(() => ({} as any));
  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Token exchange failed', details: tokenJson }, { status: 400 });
  }

  const accessToken = asText(tokenJson.access_token);
  const refreshToken = asText(tokenJson.refresh_token);
  const tokenType = asText(tokenJson.token_type);
  const scope = asText(tokenJson.scope);
  const expiresIn = typeof tokenJson.expires_in === 'number' ? tokenJson.expires_in : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'Token response missing access_token.' }, { status: 400 });
  }

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  // Upsert tokens (keep existing refresh_token if Google doesn't return it)
  const { data: existing } = await admin
    .from('google_calendar_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  const finalRefresh = refreshToken ?? (existing?.refresh_token ?? null);

  const { error: upsertErr } = await admin
    .from('google_calendar_tokens')
    .upsert(
      {
        user_id: userId,
        access_token: accessToken,
        refresh_token: finalRefresh,
        token_type: tokenType,
        scope,
        expires_at: expiresAt,
      },
      { onConflict: 'user_id' }
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { error: connErr } = await admin
    .from('google_calendar_connections')
    .upsert(
      {
        user_id: userId,
        calendar_id: 'primary',
      },
      { onConflict: 'user_id' }
    );

  if (connErr) {
    return NextResponse.json({ error: connErr.message }, { status: 500 });
  }

  await admin.from('google_oauth_states').delete().eq('state', state);

  const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || url.origin;
  return NextResponse.redirect(`${origin}/calendar?google=connected`, { status: 302 });
}
