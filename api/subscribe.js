import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
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
    // Save/Upsert the subscription in Supabase push_subscriptions table
    // We check if the subscription endpoint already exists, if so we update it
    const endpoint = subscription.endpoint;
    
    // First, let's see if this subscription endpoint already exists
    const { data: existing, error: checkError } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint);

    if (checkError && checkError.code !== 'PGRST116') {
      // If table doesn't exist, we notify the user to create it
      if (checkError.message.includes('does not exist')) {
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
      throw checkError;
    }

    if (existing && existing.length > 0) {
      // Update userName (and user_id when known) for existing subscription
      const updateFields = { user_name: userName, subscription };
      if (validUserId) updateFields.user_id = validUserId;
      const { error: updateError } = await supabase
        .from('push_subscriptions')
        .update(updateFields)
        .eq('endpoint', endpoint);

      if (updateError) throw updateError;
    } else {
      // Insert new subscription
      const insertFields = {
        user_name: userName,
        endpoint: endpoint,
        subscription: subscription
      };
      if (validUserId) insertFields.user_id = validUserId;
      const { error: insertError } = await supabase
        .from('push_subscriptions')
        .insert(insertFields);

      if (insertError) throw insertError;
    }

    return res.status(200).json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error) {
    console.error('Push Subscription Registration Error:', error);
    return res.status(500).json({ error: 'Failed to register subscription.', details: error.message });
  }
}
