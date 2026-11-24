// Remembers a pure function's answer per exercise name. The loggers ask the
// same handful of questions ("is this cardio?", "which muscles?", "what's its
// name key?") about the same names hundreds of thousands of times while a
// client types, each one a string scan or a wall of regexes; the names
// themselves are only ever a few hundred. Only for functions of the name
// alone: an array answer is shared between callers, so never change it in
// place.
const MAX_NAMES = 5000;

export function memoByName(fn) {
  const cache = new Map();
  return (name) => {
    if (typeof name !== 'string') return fn(name);
    const hit = cache.get(name);
    if (hit !== undefined) return hit;
    const value = fn(name);
    // Every name ever typed into a search box would otherwise stay forever.
    if (cache.size >= MAX_NAMES) cache.clear();
    cache.set(name, value);
    return value;
  };
}
