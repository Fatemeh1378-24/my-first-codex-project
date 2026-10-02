"use strict";

// Approved MFQ-2 domain membership. The supplied scoring rules use each raw
// 0–4 response directly; no items are reverse-scored and no total is produced.
const MFQ_SCORING_CONFIG = Object.freeze({
  care: [1, 7, 13, 19, 25, 31],
  equality: [2, 8, 14, 20, 26, 32],
  proportionality: [3, 9, 15, 21, 27, 33],
  loyalty: [4, 10, 16, 22, 28, 34],
  authority: [5, 11, 17, 23, 29, 35],
  purity: [6, 12, 18, 24, 30, 36]
});

/** Calculate the arithmetic mean of each MFQ-2 domain's six raw items. */
function calculateMfqScores(rawResponses, config = MFQ_SCORING_CONFIG) {
  if (!rawResponses || typeof rawResponses !== "object") throw new TypeError("MFQ raw responses are required");
  return Object.fromEntries(Object.entries(config).map(([domain, itemNumbers]) => {
    const values = itemNumbers.map(number => {
      const key = `mfq_${String(number).padStart(2, "0")}`;
      const value = rawResponses[key];
      if (!Number.isInteger(value) || value < 0 || value > 4) {
        throw new RangeError(`Missing or invalid MFQ response: ${key}`);
      }
      return value;
    });
    return [domain, values.reduce((sum, value) => sum + value, 0) / values.length];
  }));
}

globalThis.MFQ_SCORING = Object.freeze({ config: MFQ_SCORING_CONFIG, calculate: calculateMfqScores });
