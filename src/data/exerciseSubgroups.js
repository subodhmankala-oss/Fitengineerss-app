// ─── EXERCISE SUB-GROUPS ───
// Finer regions inside each Add Exercise category chip: Upper/Mid/Lower
// Chest, Lats/Upper/Mid/Lower Back (rhomboids, traps, erectors), biceps and
// triceps heads, Upper/Lower Abs + Obliques, and the leg muscles down to
// Tibialis. Driven by the exercise NAME (same approach as muscleGroups.js),
// so DB rows, the static library and custom exercises all classify the same
// way — the DB's own primary_muscle text is too inconsistent to filter on.
//
// An exercise can sit in more than one sub-group (a One Arm Row trains the
// lats AND the rhomboids; a plain barbell curl hits both biceps heads), and a
// sub-group can pull from outside its parent chip's category (Shrugs are
// tagged Shoulders but are the textbook upper-back move).

import { getMuscleGroupsForExercise } from '../utils/muscleGroups';

const primaryOf = n => getMuscleGroupsForExercise(n)[0];

const UPPER_CHEST = n => (/incline/.test(n) && /(press|fly|bench)/.test(n)) || /low.?to.?high|reverse grip bench|landmine press|decline push.?up/.test(n);
const LOWER_CHEST = n => (/decline/.test(n) && !/push.?up|crunch/.test(n)) || /high.?to.?low|crossover|incline push.?up/.test(n) || (/\bdips?\b/.test(n) && !/triceps|tricep/.test(n));
const IS_CHEST = n => primaryOf(n) === 'Chest' || /svend/.test(n);

const REAR_DELT = n => /rear delt|reverse fly|face pull|pull apart|bent over lateral|prone lateral/.test(n);

const IS_BICEPS = n => primaryOf(n) === 'Biceps';
const LONG_CURL = n => /incline.*curl|hammer|bayesian|drag curl|behind.?the.?back/.test(n);
const SHORT_CURL = n => /preacher|concentration|spider|high cable curl|wide.?grip curl/.test(n);

const IS_TRICEPS = n => primaryOf(n) === 'Triceps' || /diamond push.?up|close.?grip (bench|press|push)/.test(n);
const OVERHEAD_TRICEPS = n => /overhead|french press|triceps extension \(dumbbell\)/.test(n);

// Category chip → its sub-groups. `hint` names the inner muscles and the
// kind of movement that hits them; it shows under the chip row when picked.
export const EXERCISE_SUBGROUPS = {
  Chest: [
    { id: 'Upper Chest', hint: 'Clavicular head — incline presses, low-to-high flyes', test: n => (IS_CHEST(n) && UPPER_CHEST(n)) || /landmine press/.test(n) },
    { id: 'Mid Chest', hint: 'Sternal head — flat presses, flyes, push-ups', test: n => IS_CHEST(n) && !UPPER_CHEST(n) && !LOWER_CHEST(n) },
    { id: 'Lower Chest', hint: 'Lower fibres — decline presses, dips, high-to-low flyes', test: n => IS_CHEST(n) && LOWER_CHEST(n) },
  ],
  Back: [
    { id: 'Lats', hint: 'Latissimus dorsi + teres major — pulldowns, pull-ups, pullovers (width)', test: n => /pulldown|pull.?up|chin.?up|pullover|lat pull|(one|single).?arm.*row|meadows|straight.?arm|underhand/.test(n) && !/scapular/.test(n) },
    { id: 'Upper Back', hint: 'Upper traps — shrugs, rack pulls, upright rows', test: n => /shrug|rack pull|face pull|y raise|upright row|upward rotation/.test(n) && !/kelso/.test(n) },
    { id: 'Mid Back', hint: 'Rhomboids, middle & lower traps, rear delts — rows (thickness)', test: n => (/\brows?\b/.test(n) && !/upright|straight.?arm/.test(n)) || /reverse fly|rear delt|face pull|pull apart|scapular|kelso|chest.?supported/.test(n) },
    { id: 'Lower Back', hint: 'Erector spinae — hinges and back extensions', test: n => /back extension|hyperextension|superman|good morning|deadlift|rack pull|bird dog|cat camel/.test(n) && !/single.?leg/.test(n) },
  ],
  Shoulders: [
    { id: 'Front Delts', hint: 'Anterior deltoid — overhead presses, front raises', test: n => /front raise|overhead press|shoulders? press|military|arnold|behind neck|push press|landmine press|clean and press/.test(n) || (/seated/.test(n) && /press/.test(n) && !/chest|leg|calf/.test(n)) },
    { id: 'Side Delts', hint: 'Lateral deltoid — lateral raises, upright rows (width)', test: n => /lateral raise|upright row|y raise/.test(n) && !REAR_DELT(n) },
    { id: 'Rear Delts', hint: 'Posterior deltoid — reverse flyes, face pulls', test: REAR_DELT },
    { id: 'Rotator Cuff', hint: 'Infraspinatus + teres, over the shoulder blade — external rotations', test: n => /rotator|external rotation|internal rotation/.test(n) },
  ],
  Arms: [
    { id: 'Biceps Long Head', hint: 'Outer biceps — elbow behind the body or neutral grip (incline, Bayesian, hammer)', test: n => IS_BICEPS(n) && (LONG_CURL(n) || !SHORT_CURL(n)) },
    { id: 'Biceps Short Head', hint: 'Inner biceps — elbow in front of the body (preacher, concentration, spider)', test: n => IS_BICEPS(n) && (SHORT_CURL(n) || !LONG_CURL(n)) },
    { id: 'Triceps Long Head', hint: 'Inner/back triceps — arm overhead (overhead extensions, skullcrushers)', test: n => IS_TRICEPS(n) && (OVERHEAD_TRICEPS(n) || /skullcrusher|lying triceps/.test(n)) },
    { id: 'Triceps Lateral Head', hint: 'Outer "horseshoe", worked with the medial head — pushdowns, kickbacks, dips', test: n => IS_TRICEPS(n) && !OVERHEAD_TRICEPS(n) },
    { id: 'Forearms', hint: 'Brachioradialis + grip — hammer & reverse curls, wrist curls, carries', test: n => primaryOf(n) === 'Forearms' || /hammer/.test(n) },
  ],
  Core: [
    { id: 'Upper Abs', hint: 'Rectus abdominis, top half — crunches, sit-ups', test: n => /crunch|sit.?up|\bv[ -]?up\b|toe touch/.test(n) && !/reverse crunch|oblique|bicycle/.test(n) },
    { id: 'Lower Abs', hint: 'Rectus abdominis, bottom half — leg & knee raises, reverse crunches', test: n => /reverse crunch|leg raise|knee raise|flutter|scissor|mountain climber|\bv[ -]?up\b/.test(n) },
    { id: 'Obliques', hint: 'Side waist — twists, side planks, woodchoppers', test: n => /oblique|russian twist|side plank|bicycle|woodchop|pallof|side bend|heel taps?|windshield|wiper/.test(n) },
    { id: 'Deep Core', hint: 'Transverse abdominis — planks, dead bugs, hollow holds', test: n => /\bplank\b|dead bug|bird dog|hollow|ab wheel|pallof|vacuum|shoulder taps?/.test(n) },
  ],
  Legs: [
    { id: 'Quads', hint: 'Front of the thigh — squats, leg press, leg extensions', test: n => (primaryOf(n) === 'Quads' && !/high knees|foot fires?|steppers?/.test(n)) || /sissy|leg extension/.test(n) },
    { id: 'Hamstrings', hint: 'Back of the thigh — RDLs, leg curls, Nordics', test: n => primaryOf(n) === 'Hamstrings' || /nordic|hamstring/.test(n) },
    { id: 'Glutes', hint: 'Glute max & medius — hip thrusts, bridges, lunges', test: n => (primaryOf(n) === 'Glutes' && !/adduction/.test(n)) || /bulgarian|reverse lunge|curtsy|step.?up|pull through|sumo|kettlebell swing|fire hydrant/.test(n) },
    { id: 'Inner Thighs', hint: 'Adductors — adduction, Cossack squats', test: n => /adduct|copenhagen|cossack/.test(n) },
    { id: 'Calves', hint: 'Gastrocnemius + soleus — standing & seated calf raises', test: n => /\bcalf\b|\bcalves\b/.test(n) },
    { id: 'Tibialis', hint: 'Front of the shin — toes-up raises; balances the calves, protects knees & shins', test: n => /tibialis|tib bar|dorsiflex|toe raise/.test(n) },
  ],
};

const memo = new Map();

// Every sub-group id (across all categories) this exercise belongs to.
export function getExerciseSubgroups(name) {
  if (!name) return [];
  const key = name.trim().toLowerCase();
  if (memo.has(key)) return memo.get(key);
  const out = [];
  Object.values(EXERCISE_SUBGROUPS).forEach(list => list.forEach(sg => { if (sg.test(key)) out.push(sg.id); }));
  memo.set(key, out);
  return out;
}

export function exerciseInSubgroup(name, subgroup) {
  if (!subgroup) return true;
  return getExerciseSubgroups(name).includes(subgroup);
}

// Sub-group ids + the muscle half of each hint (before the "—"), as one
// lowercase string, so the picker's search box finds "rhomboids", "upper
// chest", "obliques", "long head", "tibialis"... The example-moves half is
// left out: searching "press" must not pull in every squat via "leg press".
export function subgroupSearchText(name) {
  const ids = new Set(getExerciseSubgroups(name));
  return Object.values(EXERCISE_SUBGROUPS).flat()
    .filter(sg => ids.has(sg.id))
    .map(sg => `${sg.id} ${sg.hint.split('—')[0]}`)
    .join(' ')
    .toLowerCase();
}
