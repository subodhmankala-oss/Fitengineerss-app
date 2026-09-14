# Generic Workout Library

Seed content for `workout_templates` (`is_default = true`, `difficulty_level` set).
Every exercise name below is copied verbatim from `LIVE_EXERCISE_LIST`
(`src/components/TrainerDashboard.jsx`), the app's canonical exercise-name list,
so nothing here needs name reconciliation at seed time.

Rest times are per-set, expressed in seconds.

---

## Beginner

### Beginner Full Body A
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Goblet Squat | 3 x 12 | 60s |
| Push-up | 3 x 10 | 60s |
| Dumbbell Row | 3 x 12 | 60s |
| Plank | 3 x 30s | 45s |

### Beginner Full Body B
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Leg Press | 3 x 12 | 60s |
| Chest Press (Machine) | 3 x 12 | 60s |
| Seated Row (Machine) | 3 x 12 | 60s |
| Dead Bug | 3 x 12 | 45s |

### Beginner Lower & Core
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Dumbbell Squat | 3 x 12 | 60s |
| Glute Bridge | 3 x 15 | 45s |
| Calf Raise (Standing) | 3 x 15 | 45s |
| Crunch | 3 x 15 | 45s |

---

## Intermediate

### Intermediate Push
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Bench Press | 4 x 8–10 | 90s |
| Overhead Press (Dumbbell) | 3 x 10 | 75s |
| Incline Dumbbell Press | 3 x 10 | 75s |
| Cable Fly | 3 x 12 | 60s |
| Triceps Pushdown | 3 x 12 | 60s |

### Intermediate Pull
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Barbell Row | 4 x 8–10 | 90s |
| Lat Pulldown | 3 x 10 | 75s |
| Seated Cable Row | 3 x 12 | 75s |
| Face Pull | 3 x 15 | 60s |
| Hammer Curl | 3 x 12 | 60s |

### Intermediate Legs
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Barbell Squat | 4 x 8–10 | 90s |
| Romanian Deadlift | 3 x 10 | 90s |
| Leg Press | 3 x 12 | 75s |
| Leg Curl (Seated) | 3 x 12 | 60s |
| Calf Raise (Standing) | 3 x 15 | 60s |

### Intermediate Upper Body
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Shoulder Press (Barbell) | 4 x 8 | 90s |
| Pull-up | 3 x 8 | 90s |
| Dip | 3 x 10 | 75s |
| Dumbbell Row | 3 x 10 | 75s |
| Lateral Raise | 3 x 15 | 60s |

### Intermediate Core & Conditioning
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Kettlebell Swing | 4 x 15 | 60s |
| Russian Twist | 3 x 20 | 45s |
| Hanging Knee Raise | 3 x 12 | 45s |
| Mountain Climber | 3 x 30s | 45s |
| Farmer Walk | 3 x 40m | 60s |

---

## Advanced

### Advanced Push (Strength)
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Bench Press | 5 x 5 | 120s |
| Incline Barbell Press | 4 x 6 | 100s |
| Overhead Press (Barbell) | 4 x 6 | 100s |
| Close Grip Bench Press | 3 x 8 | 90s |
| Cable Overhead Triceps Extension | 3 x 12 | 60s |

### Advanced Pull (Strength)
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Deadlift | 5 x 5 | 150s |
| Pendlay Row | 4 x 6 | 100s |
| Pull-up | 4 x 8 | 90s |
| Barbell Shrug | 3 x 10 | 75s |
| Face Pull (Cable) | 3 x 15 | 60s |

### Advanced Legs (Strength)
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Front Squat | 5 x 5 | 150s |
| Romanian Deadlift | 4 x 8 | 100s |
| Bulgarian Split Squat | 3 x 10 | 90s |
| Hack Squat | 3 x 10 | 90s |
| Seated Calf Raise | 4 x 15 | 60s |

### Advanced Hypertrophy Push
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Incline Dumbbell Press | 4 x 10 | 90s |
| Chest Dip | 4 x 10 | 90s |
| Cable Crossover | 3 x 15 | 60s |
| Lateral Raise (Cable) | 4 x 15 | 60s |
| Triceps Rope Pushdown | 4 x 12 | 60s |

### Advanced Hypertrophy Pull
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Lat Pulldown (Wide Grip) | 4 x 10 | 90s |
| One Arm Dumbbell Row | 4 x 10 | 90s |
| Cable Row (Seated) | 4 x 12 | 75s |
| Rear Delt Fly (Cable) | 3 x 15 | 60s |
| EZ Bar Curl | 4 x 10 | 60s |

### Advanced Athletic Conditioning
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Box Jump | 5 x 5 | 90s |
| Burpee | 4 x 15 | 60s |
| Kettlebell Swing | 4 x 20 | 60s |
| Sumo Deadlift | 4 x 6 | 120s |
| Plank (Side) | 3 x 45s | 45s |

### Advanced Full Body Power
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Clean and Press | 5 x 5 | 120s |
| Front Squat | 4 x 8 | 100s |
| Push-up (Wide Grip) | 4 x 15 | 60s |
| Box Squat | 4 x 8 | 90s |
| V Up | 4 x 15 | 45s |

---

# Home Library (bodyweight / no equipment)

Same `workout_templates` table, `category = 'home'` (the Gym library above is
`category = 'gym'`). Seeded by `supabase_home_workout_library.sql`. Every
exercise here is achievable with no equipment at all.

## Home — Beginner

### Home Beginner Full Body A
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Squat | 3 x 12 | 60s |
| Push Up | 3 x 10 | 60s |
| Glute Bridge | 3 x 15 | 45s |
| Plank | 3 x 30s | 45s |

### Home Beginner Full Body B
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Split Squat | 3 x 10 | 60s |
| Incline Push-up | 3 x 12 | 60s |
| Superman | 3 x 15 | 45s |
| Dead Bug | 3 x 12 | 45s |

### Home Beginner Core & Mobility
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Bird dog | 3 x 10 | 45s |
| Cat camel | 3 x 10 | 45s |
| Crunch | 3 x 15 | 45s |
| Wall Sit | 3 x 30s | 45s |

## Home — Intermediate

### Home Intermediate Upper Body
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Push Up | 4 x 15 | 60s |
| Diamond Push-up | 3 x 12 | 60s |
| Explosive / Plyometric Push-Up | 3 x 10 | 75s |
| Superman | 3 x 15 | 45s |
| Plank | 3 x 45s | 45s |

### Home Intermediate Lower Body
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Jump Squat | 4 x 12 | 75s |
| Bulgarian Split Squat | 3 x 10 | 75s |
| Reverse Lunge | 3 x 12 | 60s |
| Glute Bridge | 3 x 15 | 60s |
| Wall Sit | 3 x 40s | 45s |

### Home Intermediate Core & Cardio
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Russian Twist | 3 x 20 | 45s |
| V Up | 3 x 15 | 45s |
| Sit Up | 3 x 20 | 45s |
| Mountain Climber | 3 x 30s | 45s |
| Burpee | 3 x 12 | 60s |

## Home — Advanced

### Home Advanced Push
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Diamond Push-up | 4 x 15 | 60s |
| Explosive / Plyometric Push-Up | 4 x 12 | 75s |
| Deficit Push-Up | 3 x 12 | 75s |
| Push-up (Wide Grip) | 3 x 15 | 60s |
| Plank | 4 x 45s | 45s |

### Home Advanced Legs
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Jump Squat | 5 x 15 | 75s |
| Bulgarian Split Squat | 4 x 12 | 75s |
| Curtsy Lunge | 3 x 12 | 60s |
| Single Leg Deadlift | 3 x 10 | 60s |
| Wall Sit | 4 x 45s | 45s |

### Home Advanced Conditioning
| Exercise | Sets x Reps | Rest |
|---|---|---|
| Burpee | 5 x 15 | 60s |
| High Knees | 4 x 30s | 45s |
| Jumping Jack | 4 x 30s | 45s |
| Mountain Climber | 4 x 30s | 45s |
| Foot Fires | 3 x 30s | 45s |
