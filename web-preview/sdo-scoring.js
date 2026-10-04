"use strict";

// The anti-dominance/equality-worded SDO7 items are reverse-scored so higher
// final scores consistently indicate greater social-dominance orientation.
const SDO_REVERSE_SCORED_ITEMS = Object.freeze([5, 6, 7, 8, 13, 14, 15, 16]);

/** Return the mean of all 16 items after applying 8 - response when reversed. */
function calculateSdoScore(rawResponses, reverseScoredItems = SDO_REVERSE_SCORED_ITEMS) {
  if (!rawResponses || typeof rawResponses !== "object") throw new TypeError("SDO raw responses are required");
  const reversed = new Set(reverseScoredItems);
  const scored = Array.from({ length: 16 }, (_, index) => {
    const number = index + 1;
    const key = `sdo_${String(number).padStart(2, "0")}`;
    const value = rawResponses[key];
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      throw new RangeError(`Missing or invalid SDO response: ${key}`);
    }
    return reversed.has(number) ? 8 - value : value;
  });
  return scored.reduce((sum, value) => sum + value, 0) / scored.length;
}

globalThis.SDO_SCORING = Object.freeze({
  reverseScoredItems: SDO_REVERSE_SCORED_ITEMS,
  calculate: calculateSdoScore
});
