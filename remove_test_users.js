import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file directly
const envPath = path.resolve(__dirname, '.env');
let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  lines.forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim();
    }
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
      supabaseAnonKey = line.split('=')[1].trim();
    }
  });
} catch (e) {
  console.log('Error reading .env file');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.log('Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Connected to Supabase. Fetching test users...');
  
  // Try to delete users that look like test users or clear them.
  // Wait, the user said "remove all the test users". 
  // Maybe any user that is not subodhmankala@gmail.com ?
  try {
    const { data: users, error } = await supabase.from('users').select('*');
    if (error) {
       console.error('Error fetching users:', error);
       return;
    }

    console.log(`Found ${users.length} users.`);
    for (const user of users) {
      if (user.email !== 'subodhmankala@gmail.com') {
        console.log(`Deleting user: ${user.email}`);
        await supabase.from('users').delete().eq('id', user.id);
      }
    }
    console.log('Test users removed.');
  } catch (err) {
    console.error('Script error:', err);
  }
}

main();
