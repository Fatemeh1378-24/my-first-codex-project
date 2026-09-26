import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const appPath = new URL("app.js", import.meta.url);
const htmlPath = new URL("index.html", import.meta.url);
const cssPath = new URL("styles.css", import.meta.url);
const source = fs.readFileSync(appPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const definitions = source.slice(0, source.indexOf('document.addEventListener("keydown"'));
const context = { document: { querySelectorAll: () => [] }, location: { search: "?group=1" }, crypto: webcrypto, URL, URLSearchParams, console };
vm.createContext(context);
vm.runInContext(`${definitions}\nthis.preview = { buildSequence, instructionFor, calculateScores, generateParticipantId, SESSION_PARTICIPANT_ID, SESSION_GROUP, state, RESPONSES };`, context);

const { buildSequence, instructionFor, calculateScores, generateParticipantId, SESSION_PARTICIPANT_ID, SESSION_GROUP, state, RESPONSES } = context.preview;
const phrase = {
  attributeA: "یک کلمه خوب",
  attributeB: "یک کلمه بد",
  targetA: "چهره یک فرد ایرانی",
  targetB: "چهره یک فرد افغان"
};
const relevantCategories = {
  attribute: ["attributeA", "attributeB"],
  target: ["targetA", "targetB"],
  combined: ["attributeA", "attributeB", "targetA", "targetB"]
};

for (const group of [1, 2]) {
  const blocks = buildSequence(group);
  assert.equal(blocks.length, 7, `group ${group} should retain seven blocks`);
  for (const block of blocks) {
    const instruction = instructionFor(block);
    assert.match(instruction, /لطفاً تا حد امکان سریع پاسخ دهید./);
    assert.doesNotMatch(instruction, /با دقت|اشتباه کمتری|کمتر اشتباه|خطای کمتر|مواردی که به دسته/);

    for (const side of ["left", "right"]) {
      const expected = relevantCategories[block.kind]
        .filter(category => block.mapping[category] === side)
        .map(category => phrase[category])
        .join(" یا ");
      const response = RESPONSES[side];
      assert.ok(instruction.includes(`اگر ${expected} را دیدید`), `group ${group}, block ${block.part}, ${side} categories`);
      assert.ok(instruction.includes(`کلید <strong>${response.key}</strong> مربوط به پاسخ ${response.sideLabel}`), `group ${group}, block ${block.part}, ${side} key`);
      assert.ok(instruction.includes(`دکمه ${response.sideLabel} صفحه را لمس کنید`), `group ${group}, block ${block.part}, ${side} touch control`);
    }
    if (block.kind === "combined") assert.match(instruction, / یا /);
  }
}

assert.match(html, /id="left-response"[\s\S]*?<span class="key">E<\/span>/);
assert.match(html, /id="right-response"[\s\S]*?<span class="key">I<\/span>/);
assert.doesNotMatch(html, /participant-id|شناسه شرکت‌کننده/i, "participant ID must never be requested or displayed");
assert.match(css, /\.face-row img[^}]*object-fit: contain/);
assert.match(css, /\.stimulus img[^}]*object-fit: contain/);
assert.match(SESSION_PARTICIPANT_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.notEqual(generateParticipantId(), generateParticipantId(), "generated participant IDs should be unique");
assert.equal(state.participant.Participant_ID, SESSION_PARTICIPANT_ID);
assert.equal(state.participant.Group, SESSION_GROUP);
assert.equal(SESSION_GROUP, 1, "query-string counterbalancing assignment should be preserved");
assert.match(source, /state\.trials\.push\(\{ \.\.\.state\.participant, \.\.\.trial \}\)/, "raw trials must carry the session metadata");
assert.match(source, /scores = \{ \.\.\.state\.participant, \.\.\.calculateScores\(\) \}/, "score outputs must carry the session metadata");

function simulatedTrials(group, compatibleRt, incompatibleRt) {
  const parts = group === 1
    ? { 3: "compatible", 4: "compatible", 6: "incompatible", 7: "incompatible" }
    : { 3: "incompatible", 4: "incompatible", 6: "compatible", 7: "compatible" };
  return Object.entries(parts).flatMap(([partText, condition]) => {
    const part = Number(partText);
    const count = part === 3 || part === 6 ? 20 : 40;
    const center = condition === "compatible" ? compatibleRt : incompatibleRt;
    return Array.from({ length: count }, (_, index) => ({
      part, condition, blockLength: count === 20 ? "short" : "long",
      latency: center + (index % 5) * 20, initialCorrect: index % 10 !== 0,
      category: index % 2 ? "targetA" : "attributeA",
      value: index % 4 === 1 ? "Iranian_F1.jpg" : index % 4 === 3 ? "Iranian_M1.jpg" : "عالی"
    }));
  });
}

for (const group of [1, 2]) {
  const proIranian = calculateScores(simulatedTrials(group, 500, 800), "female");
  const proAfghan = calculateScores(simulatedTrials(group, 800, 500), "male");
  assert.ok(proIranian.D_short > 0 && proIranian.D_long > 0 && proIranian.D_score > 0, `group ${group}: Iranian+Good faster must be positive`);
  assert.ok(proAfghan.D_short < 0 && proAfghan.D_long < 0 && proAfghan.D_score < 0, `group ${group}: reversed pairing faster must be negative`);
  assert.equal(proIranian.D_score, (proIranian.D_short + proIranian.D_long) / 2);
  assert.equal(proIranian.excludeCriteriaMet, false);
  assert.equal(proIranian.Same_Gender_Advantage, proIranian.Gender_RT_Difference);
  assert.equal(proAfghan.Same_Gender_Advantage, -proAfghan.Gender_RT_Difference);
  assert.equal(calculateScores(simulatedTrials(group, 500, 800), "prefer_not_to_say").Same_Gender_Advantage, null);
}
assert.equal(
  calculateScores(simulatedTrials(1, 500, 800)).D_score,
  calculateScores(simulatedTrials(2, 500, 800)).D_score,
  "counterbalancing group must not change D sign or value for identical condition data"
);
const fast = simulatedTrials(1, 500, 800);
fast.slice(0, 13).forEach(trial => { trial.latency = 250; });
assert.equal(calculateScores(fast).excludeCriteriaMet, true, "more than 10% sub-300 ms trials must flag exclusion");

console.log("Verified dynamic instructions and response mappings for all 7 blocks in groups 1 and 2.");
console.log("Verified E/left and I/right controls plus non-cropping overview and trial image styles.");
console.log("Verified D-score direction in both groups, component averaging, gender RT outputs, and >10% fast-response exclusion.");
