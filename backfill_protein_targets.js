// One-off backfill: recompute protein_target/carbs_target for existing
// clients whose stored protein target was computed before the 180g cap was
// added to calculateTargetsGeneric() (see src/utils/targets.js). Only
// touches rows where the recomputed protein actually differs (i.e. clients
// who were over the new cap) — calories and fats are unaffected by the cap,
// so they're left as-is. Run once: `node backfill_protein_targets.js`.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { calculateTargetsGeneric } from './src/utils/targets.js';

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

async function backfillProteinTargets() {
  console.log('==========================================');
  console.log('PROTEIN TARGET CAP BACKFILL');
  console.log('==========================================\n');

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, user_id, full_name, weight_kg, height_cm, age, activity_level, fitness_goal, calorie_target, protein_target, carbs_target, fats_target');

  if (error) {
    console.error('[CRITICAL] Failed to fetch clients:', error.message);
    return;
  }

  console.log(`Loaded ${clients.length} client profiles.\n`);

  let checked = 0;
  let skippedNoWeight = 0;
  let updated = 0;
  let failed = 0;

  for (const c of clients) {
    if (!c.weight_kg) {
      skippedNoWeight++;
      continue;
    }
    checked++;

    const recomputed = calculateTargetsGeneric(
      c.weight_kg,
      c.height_cm,
      c.age,
      c.activity_level,
      c.fitness_goal
    );

    const storedProtein = c.protein_target != null ? Number(c.protein_target) : null;
    if (storedProtein === recomputed.protein) {
      continue; // Not affected by the cap — leave untouched.
    }

    console.log(`[FIX] ${c.full_name || c.id} (${c.weight_kg}kg, ${c.fitness_goal || 'no goal'}): protein ${storedProtein}g -> ${recomputed.protein}g, carbs ${c.carbs_target}g -> ${recomputed.carbs}g`);

    const { error: upErr } = await supabase
      .from('clients')
      .update({
        protein_target: recomputed.protein,
        carbs_target: recomputed.carbs
      })
      .eq('id', c.id);

    if (upErr) {
      failed++;
      console.error(`  Failed to update ${c.full_name || c.id}:`, upErr.message);
    } else {
      updated++;
    }
  }

  console.log('\n==========================================');
  console.log('BACKFILL REPORT');
  console.log('==========================================');
  console.log(`Total client profiles:        ${clients.length}`);
  console.log(`Skipped (no weight on file):  ${skippedNoWeight}`);
  console.log(`Checked:                      ${checked}`);
  console.log(`Updated (were over the cap):  ${updated}`);
  console.log(`Failed:                       ${failed}`);
  console.log('==========================================\n');
}

backfillProteinTargets();
