// AI Workout Draft Builder — server-side generation only. This endpoint NEVER
// writes to the database; it only returns a structured draft for the coach to
// review/edit in the existing plan editor. Saving/assigning happens through
// the same databaseService.saveWorkoutPlan() path the manual editor already
// uses, triggered client-side only when the coach explicitly presses
// "Assign Workout Plan" (see TrainerDashboard.jsx).
//
// Uses Groq's free tier (GPT-OSS-120B) via raw REST (OpenAI-compatible chat
// completions API, no SDK dependency — same pattern as every other external
// call in this api/ folder) — no billing required, and unlike Gemini's free
// tier this isn't subject to per-region quota=0 restrictions. Trade-off:
// Groq's response_format only guarantees valid JSON syntax, not adherence to
// a specific schema (Claude's tool_use / Gemini's responseSchema both
// enforce shape) — the exact shape is spelled out in the system prompt
// instead, and validateDraft() below checks the result before it ever
// reaches the client, so a malformed response fails loudly rather than
// silently breaking the editor.
//
// Architecture note for future extension (deload weeks, single-day/exercise
// regeneration, progression updates, coach style memory — see project spec):
// buildSystemPrompt/buildUserPrompt and validateDraft are kept as small,
// isolated pieces specifically so a future regenerate-one-day or
// regenerate-one-exercise endpoint can reuse them with a narrower `days`/
// `exercises` slice, rather than duplicating the prompt/validation logic.
// Not implemented now, per spec — this file only does full-draft generation.

const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const DRAFT_JSON_SHAPE = `{
  "programSummary": "1-2 sentence explanation of how this program is structured and why",
  "days": [
    {
      "dayLabel": "e.g. Monday, or Day 1",
      "focus": "e.g. Push, Upper Body, Legs",
      "planName": "short plan name, e.g. Push Day — Chest & Shoulders",
      "exercises": [
        {
          "name": "exercise name",
          "type": "strength | cardio | timed",
          "setCount": 3,
          "reps": 10,
          "durationMinutes": 20,
          "notes": "optional short coaching cue"
        }
      ]
    }
  ]
}`;

const buildSystemPrompt = () => `You are an assistant that drafts workout programs for a fitness coach. The coach reviews, edits, and approves every draft before anything is assigned to a client — you are not making the final call, so favor practical, conventional programming over anything experimental.

Rules:
- Use the client's stats (age, weight, height, goal, calories, protein target) to size the program appropriately — do not ignore them.
- If injuries or medical restrictions are mentioned, you MUST avoid exercises that load or aggravate that area, and say so in a note on the safer substitute exercise.
- Respect the coach's written instructions as the primary source of truth — advanced-option hints are secondary, the free-text instructions take priority if they conflict.
- Keep weekly volume balanced across muscle groups — do not overload one muscle group across multiple days without adequate recovery between sessions.
- Apply progressive overload thinking (e.g. slightly higher volume/intensity on primary lifts vs accessories) but do not invent specific weights — the coach fills those in.
- Only output real, recognizable exercises a coach would actually program. No invented or joke exercise names.
- "type" must be exactly "strength", "cardio", or "timed" — strength = reps+weight sets, cardio = distance/time, timed = isometric hold.
- "reps" is a single target number per set, never a range like "8-10".
- Do not include rest days as entries in "days".

Respond with ONLY valid JSON matching this exact shape — no prose, no markdown code fences, no commentary before or after:
${DRAFT_JSON_SHAPE}`;

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

// Groq/Llama gives no structural guarantee beyond "valid JSON" — check the
// shape ourselves rather than trusting it, so a malformed response surfaces
// as a clean retry prompt instead of breaking the editor client-side.
const VALID_TYPES = new Set(['strength', 'cardio', 'timed']);
const validateDraft = (draft) => {
  if (!draft || !Array.isArray(draft.days) || draft.days.length === 0) return false;
  return draft.days.every(day =>
    day && typeof day.planName === 'string' && day.planName.trim() &&
    Array.isArray(day.exercises) && day.exercises.length > 0 &&
    day.exercises.every(ex => ex && typeof ex.name === 'string' && ex.name.trim() && VALID_TYPES.has(ex.type))
  );
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing GROQ_API_KEY' });
  }

  const { client, instructions, options } = req.body || {};
  if (!client || (!instructions?.trim() && !options?.split && !options?.trainingDays)) {
    return res.status(400).json({ error: 'Missing client profile and at least instructions or an advanced option.' });
  }

  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt({ client, instructions: instructions || '', options: options || {} }) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('generate-workout-draft: Groq error:', resp.status, data);
      return res.status(502).json({ error: data?.error?.message || 'Failed to generate workout draft.' });
    }

    const rawText = data?.choices?.[0]?.message?.content;
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

    if (!validateDraft(draft)) {
      console.error('generate-workout-draft: draft failed validation:', JSON.stringify(draft));
      return res.status(502).json({ error: 'The AI returned an incomplete draft. Please try again.' });
    }

    return res.status(200).json({ draft });
  } catch (err) {
    console.error('generate-workout-draft error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate workout draft.' });
  }
}
