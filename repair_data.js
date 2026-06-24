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

async function repairData() {
  console.log('==========================================');
  console.log('FITENGINEERS SYSTEM-WIDE DATA REPAIR UTILITY');
  console.log('==========================================\n');

  try {
    // 1. Fetch all data
    console.log('Fetching active users, clients, and coaches data...');
    const { data: users, error: uErr } = await supabase.from('users').select('*');
    if (uErr) throw uErr;

    const { data: clients, error: cErr } = await supabase.from('clients').select('*');
    if (cErr) throw cErr;

    const { data: coaches, error: coachErr } = await supabase.from('coaches').select('*');
    if (coachErr) throw coachErr;

    console.log(`Loaded ${users.length} users, ${clients.length} client profiles, and ${coaches.length} coach profiles.\n`);

    // Setup stats counters
    let totalCoaches = coaches.length;
    let totalClients = 0;
    let totalBrokenLinks = 0;
    let totalRepairedRecords = 0;

    // We will use the Test Coach ID as the default for broken links
    const DEFAULT_COACH_ID = 'bc71fc39-c8ca-4368-87ba-c58b2f912a9a'; // Test Coach (a@b.com)

    // Set of all coach user_ids
    const validCoachUserIds = new Set(coaches.map(c => c.user_id));
    // Ensure default coach is in validCoachUserIds
    validCoachUserIds.add(DEFAULT_COACH_ID);

    // Track active clients
    const clientsByUserId = new Map(clients.map(c => [c.user_id, c]));

    // 2. Scan and repair Users table
    console.log('Scanning users for missing or broken fields...');
    for (const u of users) {
      const isSuperAdminEmail = u.email.toLowerCase() === 'subodhmankala@gmail.com';
      const hasCoachProfile = validCoachUserIds.has(u.id);

      // Determine proper role
      let expectedRole = u.role;
      if (isSuperAdminEmail) {
        expectedRole = 'super-admin';
      } else if (hasCoachProfile) {
        expectedRole = 'coach';
      } else if (u.role === 'coach_pending') {
        expectedRole = 'coach_pending';
      } else {
        expectedRole = 'client';
      }

      let needsUserUpdate = false;
      const updates = {};

      if (u.role !== expectedRole) {
        console.log(`[FIX] User ${u.email} has incorrect role: "${u.role}". Changing to: "${expectedRole}"`);
        updates.role = expectedRole;
        needsUserUpdate = true;
      }

      if (expectedRole === 'client') {
        totalClients++;

        // Verify status (payment_status in DB) is active
        if (u.payment_status !== 'active') {
          console.log(`[FIX] Client user ${u.email} missing active status. Setting payment_status to 'active'`);
          updates.payment_status = 'active';
          needsUserUpdate = true;
        }

        // Verify client profile exists
        const clientProfile = clientsByUserId.get(u.id);
        if (!clientProfile) {
          console.log(`[FIX] Client user ${u.email} is missing a client profile record. Creating one...`);
          const { error: insErr } = await supabase
            .from('clients')
            .insert({
              user_id: u.id,
              coach_id: u.coach_id || DEFAULT_COACH_ID,
              full_name: u.full_name || u.email.split('@')[0]
            });
          if (insErr) {
            console.error(`Failed to create client profile for ${u.email}:`, insErr.message);
          } else {
            totalRepairedRecords++;
            console.log(`Successfully created client profile for ${u.email}`);
          }
        }

        // Check if coach_id is broken (not referencing a valid coach user_id)
        if (u.coach_id && !validCoachUserIds.has(u.coach_id)) {
          console.log(`[WARN] Client user ${u.email} points to invalid/inactive coach ID: ${u.coach_id}`);
          totalBrokenLinks++;
          updates.coach_id = DEFAULT_COACH_ID;
          needsUserUpdate = true;

          // Also update client profile
          if (clientProfile) {
            const { error: upClientErr } = await supabase
              .from('clients')
              .update({ coach_id: DEFAULT_COACH_ID })
              .eq('user_id', u.id);
            if (upClientErr) console.error(`Failed to update coach reference on clients table for ${u.email}:`, upClientErr.message);
          }
        }
      }

      if (needsUserUpdate) {
        const { error: upUserErr } = await supabase
          .from('users')
          .update(updates)
          .eq('id', u.id);
        
        if (upUserErr) {
          console.error(`Failed to update user row for ${u.email}:`, upUserErr.message);
        } else {
          totalRepairedRecords++;
          console.log(`Successfully updated user row for ${u.email}`);
        }
      }
    }

    // 3. Scan and repair Clients table
    console.log('\nScanning client profiles table for orphan relationships...');
    for (const c of clients) {
      const user = users.find(u => u.id === c.user_id);
      
      if (!user) {
        console.log(`[WARN] Client profile ID ${c.id} refers to non-existent user_id: ${c.user_id}. Cleaning orphan client profile...`);
        const { error: delErr } = await supabase
          .from('clients')
          .delete()
          .eq('id', c.id);
        if (delErr) {
          console.error(`Failed to delete orphan client profile ${c.id}:`, delErr.message);
        } else {
          totalRepairedRecords++;
          console.log(`Deleted orphan client profile ${c.id}`);
        }
        continue;
      }

      // Check if client profile coach_id is broken
      if (c.coach_id && !validCoachUserIds.has(c.coach_id)) {
        console.log(`[WARN] Client profile for ${c.full_name} points to invalid/inactive coach ID: ${c.coach_id}`);
        totalBrokenLinks++;
        
        const { error: upClientErr } = await supabase
          .from('clients')
          .update({ coach_id: DEFAULT_COACH_ID })
          .eq('id', c.id);
        
        if (upClientErr) {
          console.error(`Failed to repair coach_id on client profile ${c.full_name}:`, upClientErr.message);
        } else {
          totalRepairedRecords++;
          console.log(`Repaired coach_id to default coach for client profile ${c.full_name}`);
        }

        // Also sync on users table
        if (user.coach_id !== DEFAULT_COACH_ID) {
          const { error: upUserErr } = await supabase
            .from('users')
            .update({ coach_id: DEFAULT_COACH_ID })
            .eq('id', c.user_id);
          if (upUserErr) console.error(`Failed to sync coach_id on users table for ${user.email}:`, upUserErr.message);
        }
      }

      // Verify that user record role and coach match
      if (user.role !== 'client' || user.coach_id !== c.coach_id || user.payment_status !== 'active') {
        console.log(`[FIX] Syncing role/coach_id from client profile to users table for: ${user.email}`);
        const { error: upUserErr } = await supabase
          .from('users')
          .update({
            role: 'client',
            coach_id: c.coach_id,
            payment_status: 'active',
            verified: true
          })
          .eq('id', c.user_id);

        if (upUserErr) {
          console.error(`Failed to sync users row for ${user.email}:`, upUserErr.message);
        } else {
          totalRepairedRecords++;
          console.log(`Successfully synced users row for ${user.email}`);
        }
      }
    }

    // 4. Ensure coach_clients relationship records are populated
    console.log('\nPopulating coach_clients relationship links...');
    if (users.length > 0) {
      // Check if coach_clients table exists
      const { data: checkTable, error: checkErr } = await supabase
        .from('coach_clients')
        .select('*')
        .limit(1);
      
      if (!checkErr) {
        const { data: relationships } = await supabase.from('coach_clients').select('*');
        const relationsMap = new Set((relationships || []).map(r => `${r.coach_id}_${r.client_id}`));

        for (const c of clients) {
          if (c.coach_id && c.user_id) {
            const relKey = `${c.coach_id}_${c.user_id}`;
            if (!relationsMap.has(relKey)) {
              console.log(`[FIX] Creating missing coach_clients relationship: Coach ${c.coach_id} -> Client ${c.user_id}`);
              const { error: relErr } = await supabase
                .from('coach_clients')
                .insert({
                  coach_id: c.coach_id,
                  client_id: c.user_id,
                  status: 'active'
                });
              if (relErr) {
                console.error(`Failed to create coach_clients relationship:`, relErr.message);
              } else {
                totalRepairedRecords++;
                console.log(`Successfully created relationship record.`);
              }
            }
          }
        }
      }
    }

    console.log('\n==========================================');
    console.log('DATA REPAIR REPORT SUMMARY');
    console.log('==========================================');
    console.log(`Total Coaches:         ${totalCoaches}`);
    console.log(`Total Clients:         ${totalClients}`);
    console.log(`Total Broken Links:    ${totalBrokenLinks}`);
    console.log(`Total Repaired Records: ${totalRepairedRecords}`);
    console.log('==========================================\n');

  } catch (err) {
    console.error('[CRITICAL] Repair execution encountered an error:', err.message || err);
  }
}

repairData();
