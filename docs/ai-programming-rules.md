# AI Workout Builder — Programming Rules

The readable version of the rules the AI Draft Builder's "programming brief" follows.
The code reads every number from **`src/data/aiProgrammingRules.js`**. That file is
the source of truth: edit a value there and the behaviour changes. Then update this page
to match. `aiProgrammingRules.test.js` checks that the file is well-formed and
self-consistent; it does not check this page.

The exercise tags live in **`src/data/exerciseTags.js`** (section 9). The hand-review
sheet is `docs/ai-exercise-tags-review.csv`. To regenerate it, run
`node tools/exercise-tags-review-csv.mjs`.

These are standard strength-training defaults (ACSM/NSCA-style), not medical advice.
For a real injury the coach, or the client's physio, has the final say.

---

## 1. Experience levels — `LEVEL_RULES`

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Training days per week, usual maximum | 3 | 5 | 6 |
| Default split | Full body | Upper/Lower or Push/Pull/Legs | Push/Pull/Legs or body-part |
| Exercises per day | 4–5 | 5–6 | 6–7 |
| Big compound lifts per day | 2 | 2–3 | 3 |
| Sets per exercise | 2–3 | 3 | 3–4 |
| Weekly sets per **large** muscle (target / cap) | 8 / 10 | 12 / 16 | 16 / 20 |
| Weekly sets per **small** muscle (target / cap) | 4 / 6 | 8 / 10 | 10 / 14 |
| Hardest exercise allowed (difficulty tag 1–3) | 1 | 2 | 3 |
| Minimum rest before training the same muscle again | 48 h | 48 h | 48 h |

- **Large muscles:** chest, back, shoulders, quads, hamstrings, glutes.
- **Small muscles:** biceps, triceps, calves, forearms, core.
- **Training days (`TRAINING_DAYS`):** the coach's chosen day count always wins.
  If it is above the level's usual maximum, no days are cut. The coach gets a warning
  instead: "{days} training days is above the usual maximum of {max} for a {level}
  client. Kept as you asked — watch recovery."

---

## 2. Rep ranges by goal and level — `GOAL_RULES`

Each cell is Beginner / Intermediate / Advanced, per set.

| Goal | Main lifts | Accessories | Holds (plank etc.) | Cardio |
|---|---|---|---|---|
| **Fat Loss** | 10–12 / 8–12 / 6–10 | 12–15 / 12–15 / 10–15 | 20–30 s / 30–45 s / 45–60 s | 10–15 min easy cardio to finish every day; Advanced may do intervals for 15–20 min |
| **Muscle Building** | 10–12 / 8–10 / 6–10 | 12–15 / 10–12 / 8–12 | same | Optional, at most 10 min |
| **General Fitness** (and Gut Repair) | 10–12 / 10–12 / 8–12 | 12–15 | same | 10–15 min, plus one core exercise every day |

**Two goals picked (`TWO_GOALS`):** the first goal decides the reps; the second only adds
its cardio. For example, "Muscle Building + Fat Loss" gives Muscle Building reps plus
Fat Loss cardio. The goal text is mapped to a goal by `GOAL_ALIASES`.

---

## 3. Age bands — `AGE_BANDS`

| Age | Impact cap | Hardest exercise | Other rules |
|---|---|---|---|
| Under 18 | low | 2 | At least 8 reps on every lift |
| 18–44 | none (no cap) | per level | No change |
| 45–59 | low (Advanced: no cap) | 2 (Advanced: 3) | At least 8 reps on main lifts; one core-stability or mobility exercise per day |
| 60+ | **no impact** (no jumps, landings or running; standing moves kept, seated/supported preferred) | 2 (Beginner: 1) | 10–15 reps; prefer machines and supported moves; one balance exercise per day; no barbell overhead press, no jumping, no Olympic-style lifts (excluded by name in the config) |

---

## 4. BMI bands — `BMI`

**These rules apply to Beginner and Intermediate clients only, not Advanced.** BMI is
computed from height and weight. If either is missing, these rules don't apply.

| BMI | Rule |
|---|---|
| Under 30 | No change |
| 30–34.9 | Impact capped at low: no jumps, burpees, box jumps, high knees or running. Cardio: cross trainer, cycling or incline walk |
| 35 and over | No impact (as for 60+: standing moves kept, seated/supported preferred). No fast floor-to-standing moves (burpees, inch worm, wall ball). Push-ups only in incline or knee versions. Prefer seated or supported exercises. Cardio: cycling, air rowing or incline walk |

---

## 5. Sex — `SEX_RULES`

**Default: no rule.** Sets, reps and exercise choice are the same for men and women.
Sex is still sent to the AI so it can phrase things appropriately.

The optional emphasis is **OFF** (`femaleGluteEmphasis.enabled: false`). When it is on,
a female client's lower-body day gets at least one glute-focused exercise.

---

## 6. Injuries — `INJURY_AREAS`

The coach ticks the affected body areas. Each area excludes every exercise tagged with
its joint. Free text is still allowed, but if it doesn't match an area, nothing is
excluded automatically. The coach sees this warning instead: "Couldn't match this injury
to a body area. Check the exercises yourself."

| Area | Excludes exercises tagged | Examples excluded | Preferred substitutes (never tagged with that joint) |
|---|---|---|---|
| **Lower back** | lumbar | Deadlifts, rack pull, good morning, barbell back squat, bent-over/Pendlay row, sit-ups, V-ups, Russian twist | Chest-supported row, seated cable row, leg press, goblet squat, hip thrust, glute bridge, bird dog, dead bug, Pallof press, side plank |
| **Knee** | knee | Jump squat, box jump, burpee, Bulgarian split squat, lunges, sissy squat, Cossack squat, running | Box squat, hip thrust, glute bridge, leg curl, Romanian deadlift, cycling |
| **Shoulder** | shoulder | Barbell overhead press, behind-neck press, upright row, dips, push press, clean and press, Arnold press | Landmine press, floor press, cable row, face pull, external rotation |
| **Wrist / elbow** | wrist | Push-ups on the palms, straight-bar curl, skullcrusher, front squat | Forearm plank, hammer curl, EZ-bar or cable curl, machines |
| **Hip** | hip | Deep or sumo squat, Cossack squat, lunges, hanging leg raise | Glute bridge, leg press, leg curl, cable pull-through |
| **Neck** | neck | Shrugs, behind-neck press, upright row, crunches/sit-ups | Dead bug, plank, Pallof press |

### Untagged exercises — `UNTAGGED`

Coaches' custom exercises, and any new catalog row not yet in `exerciseTags.js`, have no
tags. They are **never excluded automatically**. When the client has an injury or any
impact cap applies, each one used in the draft is flagged to the coach: "{name} has no
safety tags (custom or new exercise) — check it suits this client."

---

## 7. Defaults when data is missing — `MISSING_DATA`

| Missing | What happens |
|---|---|
| Experience | Use `library_level` if set; otherwise the level the coach picks when generating (a required field). **Never defaults to Beginner.** |
| Age | No age rule |
| Sex | No rule (same as the default) |
| Height or weight | No BMI rule, and **no weight is sent** (the old placeholder 70 kg is gone) |
| Goal | General Fitness |
| Injuries | None |
| Equipment | Full gym |

---

## 8. When rules conflict — `CONFLICT_PRIORITY`

1. **Injury exclusions always win.** The coach's typed instructions can't override them.
   The coach can still hand-edit the draft afterwards.
2. **Safety caps from age and BMI** come next. For impact and difficulty, the strictest
   of age, BMI and level applies. The coach's typed instructions *can* override these
   (for example, "she's a trained runner, jumps are fine").
3. **Coach instructions.**
4. **Goal.**
5. **Level.**
6. **Advanced-option hints.**

---

## 9. Exercise tags — `TAG_VALUES`, `src/data/exerciseTags.js`

Every catalog exercise (329 on 2026-11-11) has these tags:

- **Impact**
  - `none`: seated, lying or supported moves.
  - `low`: standing moves with both feet staying on the ground.
  - `high`: anything with a jump, a landing or running.
- **Difficulty**
  - `1`: machines, cables, supported or basic bodyweight moves, and simple free-weight isolation.
  - `2`: free-weight compound lifts and single-leg work.
  - `3`: technical barbell lifts, Olympic-style lifts and advanced bodyweight moves.
- **Joints loaded:** `lumbar`, `knee`, `shoulder`, `wrist` (meaning wrist/elbow), `hip`, `neck`.
- **Equipment:** `barbell` (including EZ bar, landmine and T-bar), `dumbbell`, `cable`,
  `machine` (including Smith and cardio machines), `kettlebell`, `band`, `bodyweight`,
  `other`.

**What a cap lets through (`IMPACT_CAPS`).** Cap `low` allows `none` and `low` exercises. Cap `none` ("no impact") also allows `none` and `low`: it removes jumps, landings and running, and tells the model to prefer seated, lying or supported exercises. Coach decision 2026-11-11: allowing seated, lying or supported exercises only left a 60+ beginner with a knee injury and home kit 48 of 314 exercises and no cardio.
