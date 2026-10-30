export function buildInviteShareText(coachName, origin, code) {
  return `Hi! I'm ${(coachName || 'your coach').trim()} from Fitengineers. Join my coaching program here: ${origin} — use invitation code: ${code}`;
}
