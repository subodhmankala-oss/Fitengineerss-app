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

async function testTransactionRPC() {
  console.log('=============================================');
  console.log('TESTING DEPLOYED RPC TRANSACTION ON REMOTE DB');
  console.log('=============================================\n');

  // Generate a random client UUID (mocking a user registered in auth but not public.users)
  const testClientId = '00000000-0000-0000-0000-' + Math.floor(100000000000 + Math.random() * 900000000000);
  const testInviteCode = 'TEST' + Math.floor(100 + Math.random() * 900);
  const coachUserId = 'bc71fc39-c8ca-4368-87ba-c58b2f912a9a'; // Test Coach (a@b.com)

  try {
    // 1. Create a mock invitation code linked to our Test Coach
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: invErr } = await supabase.from('invitations').insert({
      code: testInviteCode,
      coach_id: coachUserId,
      expires_at: expiresAt,
      used: false
    });
    if (invErr) throw new Error('Failed to insert test invitation: ' + invErr.message);
    console.log('✔ Mock invitation created.');

    // 2. Execute the RPC transaction
    console.log('Executing link_coach_and_enter_transaction RPC...');
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('link_coach_and_enter_transaction', {
      p_invite_code: testInviteCode,
      p_client_id: testClientId
    });

    if (rpcErr) {
      throw new Error('RPC Execution returned DB error: ' + rpcErr.message);
    }
    
    console.log('RPC Response:', rpcRes);
    if (!rpcRes || !rpcRes.success) {
      throw new Error('Transaction reported success: false. Error: ' + (rpcRes ? rpcRes.error : 'Unknown'));
    }
    console.log('✔ RPC transaction completed successfully.');

    // 3. Verify Database State
    console.log('\nVerifying database consistency...');

    // A. Verify invitation is marked used
    const { data: verifyInvite } = await supabase
      .from('invitations')
      .select('*')
      .eq('code', testInviteCode)
      .single();
    
    const passInvite = verifyInvite && verifyInvite.used === true && verifyInvite.used_by === testClientId;
    console.log(`- Invitation correct: ${passInvite ? 'YES' : 'NO'}`);

    // B. Verify user row is created and linked
    const { data: verifyUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', testClientId)
      .single();
    
    const passUser = verifyUser && verifyUser.role === 'client' && verifyUser.coach_id === coachUserId && verifyUser.payment_status === 'active';
    console.log(`- Public user row created: ${passUser ? 'YES' : 'NO'}`);

    // C. Verify client profile is created
    const { data: verifyClient } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', testClientId)
      .single();
    
    const passClient = verifyClient && verifyClient.coach_id === coachUserId;
    console.log(`- Client profile created: ${passClient ? 'YES' : 'NO'}`);

    if (passInvite && passUser && passClient) {
      console.log('\n🎉 SUCCESS: The transaction function is fully operational and works perfectly!');
    } else {
      console.log('\n❌ ERROR: Inconsistent database state detected.');
    }

  } catch (err) {
    console.error('\n❌ TEST ERROR:', err.message || err);
  } finally {
    // 4. Cleanup test records
    console.log('\nCleaning up test records...');
    await supabase.from('invitations').delete().eq('code', testInviteCode);
    await supabase.from('clients').delete().eq('user_id', testClientId);
    await supabase.from('users').delete().eq('id', testClientId);
    console.log('✔ Cleanup complete.\n');
  }
}

testTransactionRPC();
