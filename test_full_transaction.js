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

// Mock storage for databaseService compatibility
global.window = {};
global.localStorage = {
  store: {
    userName: 'Test Client User',
    userId: 'a1f84237-fffd-4272-ace2-7083a421c09a' // subodhmankala's ID
  },
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = val; },
  removeItem(key) { delete this.store[key]; }
};

// Import databaseService using dynamic import
import('./src/services/databaseService.js').then(async (m) => {
  const databaseService = m.default;

  try {
    const coachUserId = 'bc71fc39-c8ca-4368-87ba-c58b2f912a9a'; // Test Coach (a@b.com)
    const testCode = 'FULL' + Math.floor(100 + Math.random() * 900);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    console.log('1. Inserting invitation code...');
    await supabase.from('invitations').insert({
      code: testCode,
      coach_id: coachUserId,
      expires_at: expiresAt,
      used: false
    });

    console.log('2. Running linkCoachAndEnterTransaction...');
    const result = await databaseService.linkCoachAndEnterTransaction(testCode, 'a1f84237-fffd-4272-ace2-7083a421c09a');
    console.log('Result:', result);

    // Clean up
    await supabase.from('invitations').delete().eq('code', testCode);
  } catch (err) {
    console.error('Test failed with error:', err);
  }
});
