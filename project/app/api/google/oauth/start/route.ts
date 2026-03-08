import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function base64Url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Base64Url(input: string) {
  return base64Url(crypto.createHash('sha256').update(input).digest());
}

function randomUrlSafeString(bytes = 32) {
  return base64Url(crypto.randomBytes(bytes));
}

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

export async function GET(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
  }
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Missing GOOGLE_OAUTH_CLIENT_ID.' }, { status: 500 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const jwt = getBearerToken(req);
  if (!jwt) return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 });

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = data.user.id;

  const url = new URL(req.url);
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    url.origin;

  const redirectUri = `${origin}/api/google/oauth/callback`;

  const state = randomUrlSafeString(24);
  const codeVerifier = randomUrlSafeString(48);
  const codeChallenge = sha256Base64Url(codeVerifier);

  const { error: insertErr } = await admin.from('google_oauth_states').insert({
    state,
    user_id: userId,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(authUrl.toString(), { status: 302 });
}

export async function POST(req: Request) {
  const res = await GET(req);
  // NextResponse.redirect sets Location; surface it as JSON so clients can navigate.
  const location = res.headers.get('location');
  if (!location) {
    return NextResponse.json({ error: 'Failed to generate OAuth URL.' }, { status: 500 });
  }
  return NextResponse.json({ url: location });
}
