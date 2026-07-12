import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Use service role key for DB writes (bypasses RLS).
  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey);
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    const normalizedEmail = email.trim().toLowerCase();
    let userId = null;

    // 1. Create pre-confirmed auth user
    const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true
    });

    if (createErr) {
      const msg = (createErr.message || '').toLowerCase();
      const alreadyExists =
        createErr.status === 422 ||
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        msg.includes('already exists');
      if (!alreadyExists) throw new Error(createErr.message);

      // Already has auth account, verify password
      const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
      if (signInErr || !signInData?.user) {
        return res.status(409).json({
          error: 'This email is already registered, but that password doesn\'t match.'
        });
      }
      userId = signInData.user.id;
    } else {
      userId = createData.user.id;
    }

    if (!userId) throw new Error('Could not create client account. Please try again.');

    // 2. Insert/update public.users row
    const { data: userRow, error: userErr } = await adminClient
      .from('users')
      .upsert({ email: normalizedEmail, full_name: 'Warrior', role: 'client' }, { onConflict: 'email' })
      .select('id')
      .single();
    if (userErr) throw new Error(userErr.message || 'Could not save your account details.');
    const publicUserId = userRow.id;

    // 3. Insert clients row
    const { data: clientRow, error: clientErr } = await adminClient
      .from('clients')
      .upsert({
        user_id: publicUserId,
        coach_id: null,
        full_name: 'Warrior',
        weight_kg: 70,
        height_cm: 175,
        age: 30,
        fitness_goal: 'Fat Loss',
        activity_level: 'Moderately Active',
        dietary_preference: 'Non-Vegetarian',
        calorie_target: 2000,
        protein_target: 120,
        carbs_target: 220,
        fats_target: 70
      }, { onConflict: 'user_id' })
      .select('id')
      .single();
    if (clientErr) throw new Error(clientErr.message || 'Could not save client profile.');

    // 4. Authenticate to get a live session
    const { data: finalSignIn } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    return res.status(200).json({
      success: true,
      hasSession: !!finalSignIn?.session,
      userId: publicUserId,
      clientId: clientRow.id,
      access_token: finalSignIn?.session?.access_token || null,
      refresh_token: finalSignIn?.session?.refresh_token || null
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
}
