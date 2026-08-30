// Extracted from WorkoutTracker.jsx (2026-09-01) — that file is a React
// component, and exporting a plain data array alongside it disables Vite's
// Fast Refresh for the whole file: any edit to WorkoutTracker.jsx forced a
// full module reload/remount instead of a state-preserving hot update,
// which is why editing that file kept dropping the client's session/dashboard
// state back to a fresh "0 sessions" load. Moving this array to its own
// data-only module fixes that — WorkoutTracker.jsx now exports components
// only, so Fast Refresh can do its job again.
//
// The 16 rich presets (with video/guide) used as a local fallback when the
// DB-backed exercise fetch fails/times out — without it, a network hiccup
// meant those exercises' real video/guide data was completely unreachable,
// not just briefly delayed. Used by both WorkoutTracker's Guide button and
// TrainerDashboard's Form Guide.
export const presetExercises = [
  {
    name: 'Shoulders Press',
    category: 'Shoulders',
    primary: 'Deltoids',
    secondary: 'Triceps, Upper Chest',
    videoFile: '/videos/shoulders-press.mp4',
    guide: {
      target: 'Deltoids (Shoulders), Triceps, Upper Chest',
      setup: 'Sit on a bench with back support. Hold dumbbells at shoulder height with an overhand grip, elbows bent at 90 degrees.',
      execution: 'Press the weights straight up above your head until your arms are fully extended. Lower slowly back to the starting point.',
      tip: 'Keep your core engaged and avoid arching your lower back as you press the weights overhead.'
    }
  },
  {
    name: 'Biceps Curls',
    category: 'Arms',
    primary: 'Biceps',
    secondary: 'Brachialis, Brachioradialis',
    videoFile: '/videos/biceps-curls.mp4',
    guide: {
      target: 'Biceps Brachii, Brachialis, Brachioradialis',
      setup: 'Stand upright with feet shoulder-width apart, holding dumbbells at your sides with palms facing forward.',
      execution: 'Keep elbows close to your torso. Curl the weights while contracting your biceps. Lower slowly to full extension.',
      tip: 'Do not swing your body or use momentum. Keep your upper arms completely stationary during the movement.'
    }
  },
  {
    name: 'One Arm Row',
    category: 'Back',
    primary: 'Latissimus Dorsi',
    secondary: 'Rhomboids, Trapezius, Biceps',
    videoFile: '/videos/one-arm-row.mp4',
    guide: {
      target: 'Latissimus Dorsi (Lats), Rhomboids, Trapezius, Biceps',
      setup: 'Place one knee and same-side hand on a flat bench. Keep your back flat and parallel to the floor, holding a dumbbell in the other hand.',
      execution: 'Row the dumbbell up to your hip crease, squeezing your shoulder blade at the peak. Lower with control to full stretch.',
      tip: 'Pull with your elbow rather than your hand. Maintain a neutral spine throughout the set.'
    }
  },
  {
    name: 'Lat Pull Down',
    category: 'Back',
    primary: 'Latissimus Dorsi',
    secondary: 'Upper Back, Biceps',
    videoFile: '/videos/lat-pull-down.mp4',
    guide: {
      target: 'Latissimus Dorsi (Lats), Upper Back, Biceps',
      setup: 'Sit at a pulldown station and adjust the thigh pad. Grasp the bar with a wide overhand grip, leaning slightly back.',
      execution: 'Pull the bar down to your upper chest by driving your elbows down and back. Squeeze your lats and slowly return.',
      tip: 'Avoid pulling the bar behind your neck. Control the weight on the way up to maximize hypertrophy.'
    }
  },
  {
    name: 'Flat Bench Press',
    category: 'Chest',
    primary: 'Pectoralis Major',
    secondary: 'Anterior Deltoids, Triceps',
    videoFile: '/videos/flat-bench-press.mp4',
    guide: {
      target: 'Pectoralis Major (Chest), Anterior Deltoids, Triceps',
      setup: 'Lie flat on a bench, grip the barbell slightly wider than shoulder-width. Keep feet flat on the floor and retract shoulder blades.',
      execution: 'Unrack the bar and lower it slowly to your mid-chest. Press upward in a slight arc until arms are locked out.',
      tip: 'Keep your elbows tucked at roughly 45 degrees. Do not bounce the bar off your chest.'
    }
  },
  {
    name: 'Incline Dumbbell Press',
    category: 'Chest',
    primary: 'Upper Chest',
    secondary: 'Shoulders, Triceps',
    videoFile: '/videos/incline-dumbbell-press.mp4',
    guide: {
      target: 'Clavicular Pectoralis (Upper Chest), Shoulders, Triceps',
      setup: 'Set an incline bench to 30-45 degrees. Sit with dumbbells at your chest, elbows tucked, feet firmly planted.',
      execution: 'Press the dumbbells straight up over your chest until arms are extended. Lower slowly until you feel a deep chest stretch.',
      tip: 'Keep your shoulder blades pinched together. Press in a stable, controlled path.'
    }
  },
  {
    name: 'Cable Crossover',
    category: 'Chest',
    primary: 'Pectoralis Major',
    secondary: 'Anterior Deltoids',
    videoFile: '/videos/cable-crossover.mp4',
    guide: {
      target: 'Sternal Pectoralis (Inner & Lower Chest)',
      setup: 'Set pulleys to high position. Hold handles, step forward with one foot, lean slightly forward, arms extended out.',
      execution: 'Bring hands down and forward in a wide arc until they meet or cross over. Squeeze your chest hard at the bottom.',
      tip: 'Keep a slight bend in your elbows. Do not let the weights fly back aggressively; control the eccentric phase.'
    }
  },
  {
    name: 'Barbell Squat',
    category: 'Legs',
    primary: 'Quadriceps',
    secondary: 'Glutes, Hamstrings, Core',
    videoFile: '/videos/barbell-squat.mp4',
    guide: {
      target: 'Quadriceps, Gluteus Maximus, Hamstrings, Core',
      setup: 'Rest the barbell across your upper traps. Stand with feet slightly wider than shoulder-width, toes flared out.',
      execution: 'Send hips back and bend knees to squat down until thighs are parallel to floor or lower. Drive through heels to stand.',
      tip: 'Keep your chest up and knees tracking in line with your toes. Never let your knees cave inward.'
    }
  },
  {
    name: 'Romanian Deadlift',
    category: 'Legs',
    primary: 'Hamstrings',
    secondary: 'Glutes, Lower Back',
    videoFile: '/videos/romanian-deadlift.mp4',
    guide: {
      target: 'Hamstrings, Glutes, Lower Back (Erectors)',
      setup: 'Stand tall holding dumbbells or a barbell at hip height. Feet hip-width apart, knees slightly unlocked.',
      execution: 'Hinge at your hips, pushing them back as you lower the weight down your shins. Squeeze glutes to return when stretch is felt.',
      tip: 'Keep the bar touching your legs. Maintain a flat back; do not round your spine.'
    }
  },
  {
    name: 'Leg Extensions',
    category: 'Legs',
    primary: 'Quadriceps',
    secondary: 'Rectus Femoris, Vastus Lateralis',
    videoFile: '/videos/leg-extensions.mp4',
    guide: {
      target: 'Quadriceps (Rectus Femoris, Vastus Lateralis)',
      setup: 'Sit in the extension machine, back flush against pad. Place ankles under the roller pad and hold the side handles.',
      execution: 'Extend your legs fully by contracting your quads. Hold for a split second at peak extension, then lower slowly.',
      tip: 'Keep your hips locked into the seat. Do not swing the weight or use momentum.'
    }
  },
  {
    name: 'Overhead Triceps Extension',
    category: 'Arms',
    primary: 'Triceps',
    secondary: 'Core, Shoulders',
    videoFile: '/videos/overhead-triceps-extension.mp4',
    guide: {
      target: 'Triceps Brachii (Long Head focus)',
      setup: 'Stand or sit, holding a dumbbell with both hands vertically overhead, cupping the top plate under your palms.',
      execution: 'Lower the dumbbell slowly behind your head by bending your elbows. Keep upper arms close to ears. Press back up.',
      tip: 'Do not flare your elbows excessively outward. Keep your torso upright and core tight.'
    }
  },
  {
    name: 'Hammer Curls',
    category: 'Arms',
    primary: 'Brachialis',
    secondary: 'Brachioradialis, Biceps',
    videoFile: '/videos/hammer-curls.mp4',
    guide: {
      target: 'Brachialis, Brachioradialis (Forearms), Biceps',
      setup: 'Stand tall with dumbbells in each hand, palms facing each other (neutral grip).',
      execution: 'Curl the dumbbells up toward shoulders while maintaining a neutral grip. Lower slowly to full extension.',
      tip: 'Avoid swinging the elbows forward. Squeeze the forearm and bicep muscles at the top.'
    }
  },
  {
    name: 'Plank',
    category: 'Core',
    primary: 'Core',
    secondary: 'Glutes, Shoulders',
    videoFile: '/videos/plank.mp4',
    guide: {
      target: 'Core (Rectus Abdominis, Obliques, Transverse Abdominis)',
      setup: 'Place forearms on the floor, elbows aligned under shoulders. Extend legs straight back, resting on toes.',
      execution: 'Engage your core, glutes, and thighs. Maintain a straight line from head to heels. Hold static position.',
      tip: 'Do not let your hips sag down or your butt push up in the air. Keep breathing consistently.'
    }
  },
  {
    name: 'Hanging Leg Raises',
    category: 'Core',
    primary: 'Lower Abs',
    secondary: 'Hip Flexors, Core',
    videoFile: '/videos/hanging-leg-raises.mp4',
    guide: {
      target: 'Lower Rectus Abdominis, Iliopsoas (Hip Flexors)',
      setup: 'Hang from a pull-up bar with an overhand grip, arms and legs fully extended, shoulders active.',
      execution: 'Keeping legs straight or slightly bent, engage core to raise feet up until legs are parallel to floor or higher. Lower slowly.',
      tip: 'Do not swing your body. Initiate the lift using your lower abs, not momentum.'
    }
  },
  {
    name: 'Dumbbell Lateral Raises',
    category: 'Shoulders',
    primary: 'Lateral Deltoids',
    secondary: 'Trapezius',
    videoFile: '/videos/dumbbell-lateral-raises.mp4',
    guide: {
      target: 'Lateral Deltoids (Side Shoulders)',
      setup: 'Stand upright holding dumbbells at your sides, palms facing inward. Lean forward very slightly.',
      execution: 'Raise dumbbells out to the sides in a wide arc until arms are parallel to the floor. Lower back down slowly.',
      tip: 'Keep elbows slightly bent. Do not shrug your shoulders or raise the weights above shoulder level.'
    }
  },
  {
    name: 'Pull-ups',
    category: 'Back',
    primary: 'Latissimus Dorsi',
    secondary: 'Rhomboids, Teres Major, Biceps',
    videoFile: '/videos/pull-ups.mp4',
    guide: {
      target: 'Latissimus Dorsi (Lats), Teres Major, Rhomboids, Biceps',
      setup: 'Hang from a bar with a wide overhand grip. Depress and retract your scapula (pull shoulders down).',
      execution: 'Pull your body upward by driving elbows down until your chest approaches the bar. Lower with control.',
      tip: 'Avoid kicking or kipping with your legs. Focus on a full range of motion from dead hang to chin over bar.'
    }
  }
];
