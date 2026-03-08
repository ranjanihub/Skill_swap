import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { conversation_id, sender_id, recipient_id, body: text } = body || {} as any;

    // require sender and text, and at least a conversation id or recipient
    if (!sender_id || !text || (!conversation_id && !recipient_id)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // if we only have sender and recipient, try to lookup or create the conversation
    if (!conversation_id) {
      // ensure recipient_id is defined
      recipient_id = String(recipient_id);
      // search for an existing conversation between the two
      const pairCond = `and(participant_a.eq.${sender_id},participant_b.eq.${recipient_id}),and(participant_a.eq.${recipient_id},participant_b.eq.${sender_id})`;
      const { data: existing } = await admin.from('conversations').select('id').or(pairCond).limit(1).maybeSingle();
      if (existing && (existing as any).id) {
        conversation_id = (existing as any).id;
      } else {
        const { data: newConv, error: newErr } = await admin
          .from('conversations')
          .insert({ participant_a: sender_id, participant_b: recipient_id })
          .select('id')
          .single();
        if (newErr) throw newErr;
        conversation_id = (newConv as any).id;
      }
    }

    // verify conversation exists and sender is a participant
    const { data: conv } = await admin.from('conversations').select('participant_a,participant_b').eq('id', conversation_id).maybeSingle();
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (conv.participant_a !== sender_id && conv.participant_b !== sender_id) {
      return NextResponse.json({ error: 'Sender is not a participant of this conversation' }, { status: 403 });
    }

    const other = conv.participant_a === sender_id ? conv.participant_b : conv.participant_a;

    // ensure there is an accepted connection between sender and other
    const pairCond = `and(requester_id.eq.${sender_id},recipient_id.eq.${other}),and(requester_id.eq.${other},recipient_id.eq.${sender_id})`;
    const { data: accepted } = await admin
      .from('connection_requests')
      .select('id,status')
      .or(pairCond)
      .eq('status', 'accepted')
      .limit(1);

    if (!accepted || (Array.isArray(accepted) && accepted.length === 0)) {
      return NextResponse.json({ error: 'Connection not accepted' }, { status: 403 });
    }

    // insert message as service role
    const { data: inserted, error: insertErr } = await admin
      .from('messages')
      .insert({ conversation_id, sender_id, body: text })
      .select('*')
      .single();
    if (insertErr) throw insertErr;

    // Best-effort: insert a notification for the other participant
    try {
      const { data: prof } = await admin.from('user_profiles').select('full_name').eq('id', sender_id).maybeSingle();
      const senderName = (prof as any)?.full_name || 'Someone';
      const preview = typeof text === 'string' ? String(text).slice(0, 140) : 'New message';

      await admin.from('notifications').insert({
        user_id: other,
        type: 'message',
        payload: {
          conversation_id,
          sender_id,
          sender_name: senderName,
          message: preview,
          created_at: (inserted as any)?.created_at,
        },
      });
    } catch {
      // ignore notification failures
    }

    return NextResponse.json({ ok: true, message: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
