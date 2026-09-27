// Case-insensitive "does any of these fields contain the query" check.
export function matchesSearch(query, fields) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => f && String(f).toLowerCase().includes(q));
}
