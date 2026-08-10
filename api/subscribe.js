import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Folded into this route (rather than a separate /api/unsubscribe
  // function) to stay under Vercel's Hobby-plan serverless function count
  // limit — this file already owns the full push_subscriptions row
  // lifecycle, so a DELETE here is a natural fit, not a separate endpoint.
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required.' });
    try {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Push Subscription Removal Error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe.', details: error.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST or DELETE.' });
  }

  const { userName, subscription, userId } = req.body;

  if (!userName || !subscription) {
    return res.status(400).json({ error: 'userName and subscription parameters are required.' });
  }

  // Only accept a real UUID for user_id (targeted-notification key); ignore
  // stale/mock ids so they never poison the column.
  const validUserId = (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    ? userId
    : null;

  try {
    const endpoint = subscription.endpoint;

    // Insert first, and fall back to an UPDATE only when the endpoint's
    // UNIQUE constraint says the row already exists. This replaces BOTH
    // earlier versions, each of which was broken in its own way:
    //
    // 1. The original check-then-insert-or-update raced: two registrations
    //    for the same endpoint landing close together (a retry racing the
    //    original call, multiple tabs, the PWA re-registering on every
    //    foreground) could both pass the "not found" SELECT before either
    //    INSERT committed, so the loser hit the UNIQUE constraint and 500'd
    //    with Postgres 23505 (seen in production logs, 2026-08-10).
    //
    // 2. Replacing that with a single `upsert(..., { onConflict })` looked
    //    atomic but failed 100% of the time with a 42501 RLS violation:
    //    PostgREST turns it into INSERT ... ON CONFLICT DO UPDATE, and
    //    Postgres evaluates the table's SELECT policy for that form. After
    //    sql/lock_down_reads.sql, push_subscriptions_select is
    //    `user_id = current_app_user_id() OR is_my_client(user_id) OR
    //    is_super_admin()` — which the anon key can never satisfy, so every
    //    registration was rejected outright. Verified against the live DB:
    //    a plain INSERT returns 201, the same row via ON CONFLICT returns
    //    42501 (2026-08-10).
    //
    // Insert-then-update-on-23505 needs only the INSERT and UPDATE policies
    // (both `true` here) and never the SELECT one, so it works under the
    // locked-down policies while still closing the race: if two requests
    // collide, exactly one INSERT wins and the loser updates instead of
    // erroring.
    const fields = { user_name: userName, endpoint, subscription };
    if (validUserId) fields.user_id = validUserId;

    const { error: insertError } = await supabase
      .from('push_subscriptions')
      .insert(fields);

    if (insertError) {
      // If the table doesn't exist, tell the user how to create it (same
      // guidance the old check-first path gave).
      if (insertError.message?.includes('does not exist')) {
        return res.status(500).json({
          error: 'Supabase push_subscriptions table does not exist. Please create the table in your Supabase SQL Editor.',
          sql: `
            CREATE TABLE IF NOT EXISTS push_subscriptions (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              user_name TEXT NOT NULL,
              endpoint TEXT NOT NULL UNIQUE,
              subscription JSONB NOT NULL,
              created_at TIMESTAMPTZ DEFAULT now()
            );
          `
        });
      }

      // 23505 = unique_violation on `endpoint`: this device is already
      // registered, so refresh the existing row instead. No .select() here —
      // reading the row back would re-introduce the SELECT-policy problem
      // described above.
      if (insertError.code === '23505') {
        const { error: updateError } = await supabase
          .from('push_subscriptions')
          .update(fields)
          .eq('endpoint', endpoint);
        if (updateError) throw updateError;
      } else {
        throw insertError;
      }
    }

    return res.status(200).json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error) {
    console.error('Push Subscription Registration Error:', error);
    return res.status(500).json({ error: 'Failed to register subscription.', details: error.message });
  }
}
