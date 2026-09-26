# IAT scoring specification

The hypothesis-consistent condition is **Iranian + Good / Afghan + Bad**.
The hypothesis-inconsistent condition is **Afghan + Good / Iranian + Bad**.
Consequently, every component uses `mean(inconsistent) - mean(consistent)`:
a positive score indicates a relatively stronger positive association with Iranians.
The condition label is derived from the category mapping, not presentation order, so
this interpretation is identical in counterbalancing groups 1 and 2.

## Blocks and formula

Only the four combined blocks are scored:

* `D_short`: the 20-trial consistent block and the 20-trial inconsistent block
  (parts 3 and 6; their order swaps between groups).
* `D_long`: the 40-trial consistent block and the 40-trial inconsistent block
  (parts 4 and 7; their order swaps between groups).
* `D_score`: the unweighted arithmetic mean `(D_short + D_long) / 2`.

Each component's denominator is the sample standard deviation of all retained
latencies pooled across its consistent and inconsistent blocks. This is the
Greenwald, Nosek, and Banaji (2003) improved standardized mean-difference.

## Millisecond/Inquisit compatibility rules

This project follows the bundled Millisecond/Inquisit correction-required variant:

1. An incorrect initial response displays the red X and the stimulus remains until
   the correct key is given. The scored latency is the elapsed time from stimulus
   onset through that final correct response. No fixed 600 ms error penalty is added.
2. Combined-block trials with final corrected latency above 10,000 ms are removed
   from D components, accuracy, and face-RT means. Latencies at exactly 10,000 ms
   remain eligible. No lower cutoff is applied to D calculation.
3. `percentCorrect` is the percentage of initially correct responses among those
   eligible trials.
4. `propRT300` is the proportion of all 120 combined-block trials whose final
   corrected latency is below 300 ms. `excludeCriteriaMet` is true/1 only when this
   proportion is greater than 0.10 (exactly 10% does not meet the criterion).

These rules intentionally match `pictureiat_inc.iqjs`: correction is required,
the final latency is stored, the upper inclusion bound is `<= 10000`, and the
Greenwald fast-response threshold is `> 10%` below 300 ms. The browser scorer does
not count instruction screens as trials; the Inquisit short-block callback likewise
marks its embedded instruction trial invalid for D, accuracy, and face means.

## Additional outputs

Face means use retained face trials from the same four combined blocks. Filename
suffixes `_F#` and `_M#` identify depicted gender. `Gender_RT_Difference` is male-face
mean minus female-face mean. `Same_Gender_Advantage` is that difference for female
participants, its negative for male participants, and `NA` (`null` in the calculated
output) for participants who prefer not to say. Thus a positive value always means
faster responses to same-gender faces.

Browser scoring keeps the participant metadata, calculated scores, and raw trials
internally during the session, without exposing a participant-facing download. The
browser generates an anonymous UUID when the participant session loads, never
displays or accepts an ID field, and reuses that immutable ID for IAT restarts.
Inquisit retains its native system-generated subject ID and group fields.
