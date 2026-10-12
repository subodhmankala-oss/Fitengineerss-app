// Typing a kg in one set carries it down to the sets below it in the same
// exercise, so a client doing 3 x 10 at 5 kg types it once. Only boxes that
// are still empty are filled; ones the client typed themselves, ticked sets
// and PREV pre-fills are never touched. A filled box is flagged
// (weightAutofilled), so changing the kg above (5 -> 55) updates it too,
// until the client edits that box by hand.

const isEmpty = (v) => v === '' || v === null || v === undefined;

// `sets` is the exercise's sets with the edit at setIdx already applied.
export function fillWeightBelow(sets, setIdx, value) {
  return sets.map((s, i) => {
    if (i < setIdx) return s;
    if (i === setIdx) {
      const { weightAutofilled: _a, ...rest } = s;
      return rest;
    }
    if (s.isCompleted || !(isEmpty(s.weight) || s.weightAutofilled)) return s;
    if (isEmpty(value)) {
      const { weightAutofilled: _a, ...rest } = s;
      return { ...rest, weight: '' };
    }
    return { ...s, weight: value, weightAutofilled: true, weightFromPrev: false };
  });
}
