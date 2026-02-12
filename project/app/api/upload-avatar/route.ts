import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  // Route will return a helpful error at runtime if env not configured
}

const supabaseAdmin = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE ?? '', {
  auth: { persistSession: false },
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const userId = (form.get('user_id') as string) || '';
    const bucket = (form.get('bucket') as string) || 'avatars';

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing file or user_id' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const path = `${userId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, { upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || String(uploadError) }, { status: 500 });
    }

    const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;

    return NextResponse.json({ publicUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Upload failed' }, { status: 500 });
  }
}
