import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = './.env';
let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  lines.forEach(line => {
    if (line.trim().startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim();
    }
    if (line.trim().startsWith('VITE_SUPABASE_ANON_KEY=')) {
      supabaseAnonKey = line.split('=')[1].trim();
    }
  });
} catch (e) {
  console.log('Error reading .env file:', e);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function dumpUsersAndClients() {
  console.log('--- USERS ---');
  const { data: users, error: uErr } = await supabase.from('users').select('*');
  if (uErr) {
    console.error('Error fetching users:', uErr);
  } else {
    console.table(users.map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      coach_id: u.coach_id,
      payment_status: u.payment_status,
      verified: u.verified
    })));
  }

  console.log('\n--- CLIENTS ---');
  const { data: clients, error: cErr } = await supabase.from('clients').select('*');
  if (cErr) {
    console.error('Error fetching clients:', cErr);
  } else {
    console.table(clients.map(c => ({
      id: c.id,
      user_id: c.user_id,
      coach_id: c.coach_id,
      full_name: c.full_name,
      phone_number: c.phone_number,
      created_at: c.created_at
    })));
  }

  console.log('\n--- INVITATIONS ---');
  const { data: invites, error: iErr } = await supabase.from('invitations').select('*');
  if (iErr) {
    console.error('Error fetching invitations:', iErr);
  } else {
    console.table(invites.map(i => ({
      id: i.id,
      code: i.code,
      coach_id: i.coach_id,
      used: i.used,
      used_by: i.used_by,
      used_at: i.used_at
    })));
  }
}

dumpUsersAndClients();
