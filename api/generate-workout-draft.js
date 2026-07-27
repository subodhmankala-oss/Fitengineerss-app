// AI Workout Draft Builder — server-side generation only. This endpoint NEVER
// writes to the database; it only returns a structured draft for the coach to
// review/edit in the existing plan editor. Saving/assigning happens through
// the same databaseService.saveWorkoutPlan() path the manual editor already
// uses, triggered client-side only when the coach explicitly presses
// "Assign Workout Plan" (see TrainerDashboard.jsx).
//
// Uses Google Gemini's free tier via raw REST (no SDK dependency, same
// pattern as every other external call in this api/ folder) instead of a
// paid provider — no billing required, just a free API key from Google AI
// Studio. Gemini's native structured-output mode (responseSchema) plays the
// same role Claude's tool_choice/tool_use would have.
//
// Architecture note for future extension (deload weeks, single-day/exercise
// regeneration, progression updates, coach style memory — see project spec):
// buildSystemPrompt/buildUserPrompt and DRAFT_SCHEMA are kept as small,
// isolated pieces specifically so a future regenerate-one-day or
// regenerate-one-exercise endpoint can reuse them with a narrower `days`/
// `exercises` schema slice, rather than duplicating the prompt logic. Not
// implemented now, per spec — this file only does full-draft generation.

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Gemini's responseSchema is a restricted OpenAPI-style schema (uppercase
// type names, no $ref) — same shape/intent as the exercise-editor data this
// gets converted into client-side (see convertAiDayToEditorShape in
// TrainerDashboard.jsx), just in Gemini's expected wire format.
const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    programSummary: {
      type: 'STRING',
      description: '1-2 sentence explanation of how this program is structured and why, for the coach to read.'
    },
    days: {
      type: 'ARRAY',
      description: 'One entry per training day. Do not include rest days.',
      items: {
        type: 'OBJECT',
        properties: {
          dayLabel: { type: 'STRING', description: 'e.g. "Monday", "Day 1"' },
          focus: { type: 'STRING', description: 'e.g. "Push", "Upper Body", "Legs"' },
          planName: { type: 'STRING', description: 'Short plan name, e.g. "Push Day — Chest & Shoulders"' },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'Exercise name. Avoid words like "run"/"plank"/"hold" unless the exercise genuinely is cardio or an isometric hold.' },
                type: { type: 'STRING', enum: ['strength', 'cardio', 'timed'], description: 'strength = reps+weight sets, cardio = distance/time, timed = isometric hold' },
                setCount: { type: 'INTEGER', description: 'Number of sets (strength/timed only).' },
                reps: { type: 'INTEGER', description: 'Target reps per set (strength only) — a single number, not a range.' },
                durationMinutes: { type: 'NUMBER', description: 'Duration in minutes (cardio only, or hold time in minutes for timed).' },
                notes: { type: 'STRING', description: 'Optional short coaching cue, e.g. "controlled tempo, avoid locking knees".' }
              },
              required: ['name', 'type']
            }
          }
        },
        required: ['dayLabel', 'planName', 'exercises']
      }
    }
  },
  required: ['days']
};

const buildSystemPrompt = () => `You are an assistant that drafts workout programs for a fitness coach. The coach reviews, edits, and approves every draft before anything is assigned to a client — you are not making the final call, so favor practical, conventional programming over anything experimental.

Rules:
- Use the client's stats (age, weight, height, goal, calories, protein target) to size the program appropriately — do not ignore them.
- If injuries or medical restrictions are mentioned, you MUST avoid exercises that load or aggravate that area, and say so in a note on the safer substitute exercise.
- Respect the coach's written instructions as the primary source of truth — advanced-option dropdowns are just structured hints, the free-text instructions take priority if they conflict.
- Keep weekly volume balanced across muscle groups — do not overload one muscle group across multiple days without adequate recovery between sessions.
- Apply progressive overload thinking (e.g. slightly higher volume/intensity on primary lifts vs accessories) but do not invent specific weights — the coach fills those in.
- Only output real, recognizable exercises a coach would actually program. No invented or joke exercise names.
- Respond with the workout draft JSON only, matching the given schema exactly.`;

const buildUserPrompt = ({ client, instructions, options }) => {
  const lines = [
    '=== Client Profile ===',
    `Name: ${client.name || 'Unknown'}`,
    client.age ? `Age: ${client.age}` : null,
    client.gender ? `Gender: ${client.gender}` : null,
    client.height ? `Height: ${client.height} cm` : null,
    client.weight ? `Weight: ${client.weight} kg` : null,
    client.goal ? `Fitness goal: ${client.goal}` : null,
    client.calories ? `Daily calorie target: ${client.calories} kcal` : null,
    client.protein ? `Daily protein target: ${client.protein} g` : null,
    client.experienceLevel ? `Experience level: ${client.experienceLevel}` : null,
    client.injuries ? `Injuries / pain points: ${client.injuries}` : null,
    client.equipment ? `Equipment available: ${client.equipment}` : null,
    '',
    '=== Advanced Options (hints only, coach instructions below take priority if they conflict) ===',
    options.workoutLengthMinutes ? `Target session length: ~${options.workoutLengthMinutes} min` : null,
    options.trainingDays ? `Training days per week: ${options.trainingDays}` : null,
    options.split ? `Preferred split: ${options.split}` : null,
    options.difficulty ? `Difficulty level: ${options.difficulty}` : null,
    '',
    '=== Coach Instructions ===',
    instructions?.trim() || '(none given — use the profile and advanced options above to design a sensible program)'
  ].filter(Boolean);
  return lines.join('\n');
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing GEMINI_API_KEY' });
  }

  const { client, instructions, options } = req.body || {};
  if (!client || (!instructions?.trim() && !options?.split && !options?.trainingDays)) {
    return res.status(400).json({ error: 'Missing client profile and at least instructions or an advanced option.' });
  }

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt({ client, instructions: instructions || '', options: options || {} }) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: DRAFT_SCHEMA,
          temperature: 0.6
        }
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('generate-workout-draft: Gemini error:', resp.status, data);
      return res.status(502).json({ error: data?.error?.message || 'Failed to generate workout draft.' });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: 'The AI did not return a usable draft. Please try again.' });
    }

    let draft;
    try {
      draft = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('generate-workout-draft: JSON parse failed:', parseErr, rawText);
      return res.status(502).json({ error: 'The AI returned an unreadable draft. Please try again.' });
    }

    if (!draft?.days?.length) {
      return res.status(502).json({ error: 'The AI did not return a usable draft. Please try again.' });
    }

    return res.status(200).json({ draft });
  } catch (err) {
    console.error('generate-workout-draft error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate workout draft.' });
  }
}
