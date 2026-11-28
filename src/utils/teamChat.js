// Turns founder_messages rows (sql/team_chat.sql) into chat bubbles.
//
//   kind 'message' — written by the team in Super-Admin → team bubble.
//   kind 'welcome' — the old automatic welcome. Its text speaks as one person
//     ("I'm Subodh…"), so the bubble is skipped; the sheet shows its own team
//     intro instead. A reply the client wrote to it still shows.
//   kind 'client'  — the client's own message, text in clientReply.
// Any row's clientReply becomes a "me" bubble at clientReplyAt.
export function buildChatBubbles(rows) {
  const out = [];
  for (const r of rows || []) {
    if (r.kind === 'message' && r.message) {
      out.push({ key: `${r.id}:t`, from: 'team', text: r.message, at: r.createdAt });
    }
    if (r.clientReply) {
      out.push({ key: `${r.id}:me`, from: 'me', text: r.clientReply, at: r.clientReplyAt || r.createdAt });
    }
  }
  return out.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
}

// Red dot on the Home badge: a team-written message the client hasn't opened.
export function hasUnreadTeamMessage(rows) {
  return (rows || []).some(r => r.kind === 'message' && !r.readAt);
}
