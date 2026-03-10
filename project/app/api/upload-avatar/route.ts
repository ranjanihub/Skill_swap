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

    // Ensure the bucket exists and has no restrictive MIME type filter.
    // We call updateBucket unconditionally so that even pre-existing buckets
    // created with a narrow allowedMimeTypes list get corrected on the fly.
    const { error: bucketCheckError } = await supabaseAdmin.storage.getBucket(bucket);
    if (bucketCheckError) {
      // Bucket does not exist — create it
      const { error: createBucketError } = await supabaseAdmin.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10 MB
        allowedMimeTypes: null, // no restrictions
      });
      if (createBucketError && !createBucketError.message?.includes('already exists')) {
        return NextResponse.json({ error: `Failed to create storage bucket: ${createBucketError.message}` }, { status: 500 });
      }
    } else {
      // Bucket exists — remove any MIME type restrictions so all file types are accepted
      await supabaseAdmin.storage.updateBucket(bucket, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: null,
      });
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, { upsert: true, contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || String(uploadError) }, { status: 500 });
    }

    const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;

    return NextResponse.json({ publicUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Upload failed' }, { status: 500 });
  }
}
