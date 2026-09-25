"use strict";

// Change category labels, words, and image paths here in later customizations.
const CONFIG = {
  isiMs: 250,
  errorMs: 200,
  categories: {
    attributeA: { label: "خوب", items: ["شگفت‌انگیز", "عالی", "لذت", "زیبا", "شاد", "باشکوه", "دوست‌داشتنی", "فوق‌العاده"] },
    attributeB: { label: "بد", items: ["غم‌انگیز", "وحشتناک", "عذاب", "دردناک", "هولناک", "بسیار بد", "تحقیر کردن", "زننده"] },
    targetA: { label: "Iranian", items: ["../Iranian_F1.jpg", "../Iranian_F2.jpg", "../Iranian_F3.jpg", "../Iranian_M1.jpg", "../Iranian_M2.jpg", "../Iranian_M3.jpg"] },
    targetB: { label: "Afghan", items: ["../Afghan_F1.jpg", "../Afghan_F2.jpg", "../Afghan_F3.jpg", "../Afghan_M1.jpg", "../Afghan_M2.jpg", "../Afghan_M3.jpg"] }
  }
};

const el = Object.fromEntries([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
const state = { blocks: [], blockIndex: 0, trialIndex: 0, trials: [], awaitingCorrection: false, locked: false, startedAt: 0, group: 1 };

function shuffled(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function balancedTrials(keys, count) {
  const pools = Object.fromEntries(keys.map(key => [key, []]));
  const categoryOrder = shuffled(Array.from({ length: count }, (_, index) => keys[index % keys.length]));
  const result = [];
  for (let i = 0; i < count; i++) {
    const key = categoryOrder[i];
    if (!pools[key].length) pools[key] = shuffled(CONFIG.categories[key].items);
    result.push({ category: key, value: pools[key].pop() });
  }
  return result;
}

function combinedTrials(mapping, count) {
  const attributeTrials = balancedTrials(["attributeA", "attributeB"], count / 2);
  const targetTrials = balancedTrials(["targetA", "targetB"], count / 2);
  return Array.from({ length: count }, (_, index) => {
    // The source task starts with an attribute and then strictly alternates.
    const source = (index % 2 === 0 ? attributeTrials : targetTrials).shift();
    return { ...source, correct: mapping[source.category] };
  });
}

function makeBlock({ part, kind, count, targetAOnLeft, continuation = false }) {
  const mapping = { attributeA: "left", attributeB: "right", targetA: targetAOnLeft ? "left" : "right", targetB: targetAOnLeft ? "right" : "left" };
  const trials = kind === "combined"
    ? combinedTrials(mapping, count)
    : balancedTrials(kind === "attribute" ? ["attributeA", "attributeB"] : ["targetA", "targetB"], count).map(trial => ({ ...trial, correct: mapping[trial.category] }));
  return { part, kind, count, targetAOnLeft, continuation, mapping, trials };
}

function buildSequence(group) {
  const compatible = [
    makeBlock({ part: 1, kind: "target", count: 20, targetAOnLeft: true }),
    makeBlock({ part: 2, kind: "attribute", count: 20, targetAOnLeft: true }),
    makeBlock({ part: 3, kind: "combined", count: 20, targetAOnLeft: true }),
    makeBlock({ part: 4, kind: "combined", count: 40, targetAOnLeft: true, continuation: true }),
    makeBlock({ part: 5, kind: "target", count: 20, targetAOnLeft: false }),
    makeBlock({ part: 6, kind: "combined", count: 20, targetAOnLeft: false }),
    makeBlock({ part: 7, kind: "combined", count: 40, targetAOnLeft: false, continuation: true })
  ];
  if (group === 1) return compatible;
  return [
    makeBlock({ part: 1, kind: "target", count: 20, targetAOnLeft: false }),
    makeBlock({ part: 2, kind: "attribute", count: 20, targetAOnLeft: false }),
    makeBlock({ part: 3, kind: "combined", count: 20, targetAOnLeft: false }),
    makeBlock({ part: 4, kind: "combined", count: 40, targetAOnLeft: false, continuation: true }),
    makeBlock({ part: 5, kind: "target", count: 20, targetAOnLeft: true }),
    makeBlock({ part: 6, kind: "combined", count: 20, targetAOnLeft: true }),
    makeBlock({ part: 7, kind: "combined", count: 40, targetAOnLeft: true, continuation: true })
  ];
}

function renderOverview() {
  const cards = Object.entries(CONFIG.categories).map(([key, category]) => {
    const content = key.startsWith("target")
      ? `<div class="face-row">${category.items.map(src => `<img src="${src}" alt="">`).join("")}</div>`
      : `<p>${category.items.join(" · ")}</p>`;
    return `<article class="overview-card"><h2>${category.label}</h2>${content}</article>`;
  });
  el["category-overview"].innerHTML = cards.join("");
}

function labelsFor(block) {
  const c = CONFIG.categories;
  if (block.kind === "attribute") return { left: `<span class="attribute-label">${c.attributeA.label}</span>`, right: `<span class="attribute-label">${c.attributeB.label}</span>` };
  const leftTarget = block.targetAOnLeft ? c.targetA.label : c.targetB.label;
  const rightTarget = block.targetAOnLeft ? c.targetB.label : c.targetA.label;
  if (block.kind === "target") return { left: leftTarget, right: rightTarget };
  return {
    left: `<span class="attribute-label">${c.attributeA.label}</span><span class="joiner">or</span>${leftTarget}`,
    right: `<span class="attribute-label">${c.attributeB.label}</span><span class="joiner">or</span>${rightTarget}`
  };
}

function instructionFor(block) {
  const labels = labelsFor(block);
  if (block.continuation) return `<h2>Part ${block.part} of 7</h2><p>This is the same task as the previous part.</p><p>Press <strong>E</strong> for ${labels.left.replaceAll("<span class=\"joiner\">or</span>", " or ")} and <strong>I</strong> for ${labels.right.replaceAll("<span class=\"joiner\">or</span>", " or ")}.</p>`;
  const changed = block.part === 5 ? "<p><strong>Attention: the target categories have changed sides.</strong></p>" : "";
  return `<h2>Part ${block.part} of 7</h2>${changed}<p>Press <strong>E</strong> for the category on the left and <strong>I</strong> for the category on the right.</p><p>If you make an error, a red × will appear. Press the other response to continue.</p><p>Go as fast as you can while making as few errors as possible.</p>`;
}

function start() {
  const requested = Number(new URLSearchParams(location.search).get("group"));
  state.group = requested === 1 || requested === 2 ? requested : (Math.random() < .5 ? 1 : 2);
  state.blocks = buildSequence(state.group);
  state.blockIndex = 0; state.trialIndex = 0; state.trials = []; state.locked = false;
  el.intro.hidden = true; el.summary.hidden = true; el.task.hidden = false;
  showInstruction();
}

function showInstruction() {
  const block = state.blocks[state.blockIndex];
  const labels = labelsFor(block);
  el["left-category"].innerHTML = labels.left; el["right-category"].innerHTML = labels.right;
  el["part-label"].textContent = `Part ${block.part} of 7`;
  el["trial-label"].textContent = "Instructions";
  el["progress-fill"].style.width = `${(state.blockIndex / state.blocks.length) * 100}%`;
  el.stimulus.hidden = true; el.error.hidden = true; el["response-controls"].hidden = true; el["key-hint"].hidden = true;
  el["instruction-card"].innerHTML = `${instructionFor(block)}<button class="primary-button" type="button" id="continue-button">Begin this part</button>`;
  el["instruction-card"].hidden = false;
  document.querySelector("#continue-button").addEventListener("click", beginBlock);
}

function beginBlock() {
  state.trialIndex = 0;
  el["instruction-card"].hidden = true; el.stimulus.hidden = false; el["response-controls"].hidden = false; el["key-hint"].hidden = false;
  showTrial();
}

function showTrial() {
  const block = state.blocks[state.blockIndex];
  const trial = block.trials[state.trialIndex];
  state.awaitingCorrection = false; state.locked = false; state.startedAt = performance.now();
  el.error.hidden = true;
  el["trial-label"].textContent = `Trial ${state.trialIndex + 1} of ${block.count}`;
  el["progress-fill"].style.width = `${((state.blockIndex + state.trialIndex / block.count) / state.blocks.length) * 100}%`;
  if (trial.category.startsWith("target")) {
    el.stimulus.className = "stimulus";
    el.stimulus.innerHTML = `<img src="${trial.value}" alt="Face stimulus">`;
  } else {
    el.stimulus.className = "stimulus word";
    el.stimulus.textContent = trial.value;
  }
}

function respond(side, method) {
  if (el.task.hidden || !el["instruction-card"].hidden || state.locked) return;
  const block = state.blocks[state.blockIndex];
  const trial = block.trials[state.trialIndex];
  const latency = Math.round(performance.now() - state.startedAt);
  const correctNow = side === trial.correct;
  if (!correctNow) {
    if (!state.awaitingCorrection) {
      trial.initialCorrect = false; trial.firstLatency = latency;
      state.awaitingCorrection = true;
    }
    el.error.hidden = false;
    window.setTimeout(() => { if (state.awaitingCorrection) el.error.hidden = false; }, CONFIG.errorMs);
    return;
  }
  state.locked = true;
  trial.initialCorrect ??= true;
  trial.latency = latency;
  trial.response = side;
  trial.responseMethod = method;
  trial.part = block.part;
  trial.condition = block.targetAOnLeft ? "compatible" : "incompatible";
  trial.blockLength = block.count === 20 ? "short" : "long";
  state.trials.push({ ...trial });
  el.error.hidden = true; el.stimulus.innerHTML = "";
  window.setTimeout(nextTrial, CONFIG.isiMs);
}

function nextTrial() {
  const block = state.blocks[state.blockIndex];
  state.trialIndex++;
  if (state.trialIndex < block.trials.length) return showTrial();
  state.blockIndex++;
  if (state.blockIndex < state.blocks.length) return showInstruction();
  finish();
}

function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN; }
function sampleSd(values) {
  if (values.length < 2) return NaN;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

function calculateScores() {
  const testTrials = state.trials.filter(t => [3, 4, 6, 7].includes(t.part));
  const eligible = testTrials.filter(t => t.latency <= 10000);
  const cells = {};
  for (const condition of ["compatible", "incompatible"]) for (const length of ["short", "long"])
    cells[`${condition}-${length}`] = eligible.filter(t => t.condition === condition && t.blockLength === length).map(t => t.latency);
  const shortPooled = [...cells["compatible-short"], ...cells["incompatible-short"]];
  const longPooled = [...cells["compatible-long"], ...cells["incompatible-long"]];
  const da = (mean(cells["incompatible-short"]) - mean(cells["compatible-short"])) / sampleSd(shortPooled);
  const db = (mean(cells["incompatible-long"]) - mean(cells["compatible-long"])) / sampleSd(longPooled);
  return {
    da, db, d: (da + db) / 2,
    percentCorrect: mean(eligible.map(t => t.initialCorrect ? 1 : 0)) * 100,
    propRT300: mean(testTrials.map(t => t.latency < 300 ? 1 : 0))
  };
}

function finish() {
  const scores = calculateScores();
  state.scores = scores;
  el.task.hidden = true; el.summary.hidden = false;
  const valid = Number.isFinite(scores.d);
  el["d-score"].textContent = valid ? scores.d.toFixed(3) : "N/A";
  const magnitude = !valid || Math.abs(scores.d) <= .15 ? "little to no" : Math.abs(scores.d) >= .65 ? "a strong" : Math.abs(scores.d) > .35 ? "a moderate" : "a slight";
  const preferred = scores.d >= 0 ? CONFIG.categories.targetA.label : CONFIG.categories.targetB.label;
  el.interpretation.textContent = valid ? `This score suggests ${magnitude} automatic preference for ${preferred} with ${CONFIG.categories.attributeA.label}, relative to the opposite pairing.` : "A score could not be calculated.";
  el["quality-metrics"].innerHTML = `<dt>Initial-response accuracy</dt><dd>${scores.percentCorrect.toFixed(1)}%</dd><dt>Responses under 300 ms</dt><dd>${(scores.propRT300 * 100).toFixed(1)}%</dd><dt>Fast-response exclusion flag</dt><dd>${scores.propRT300 > .1 ? "Yes" : "No"}</dd><dt>Counterbalance group</dt><dd>${state.group}</dd>`;
}

function downloadData() {
  const payload = { previewVersion: 1, completedAt: new Date().toISOString(), group: state.group, scores: state.scores, trials: state.trials };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `race-iat-preview-${Date.now()}.json` });
  link.click(); URL.revokeObjectURL(url);
}

document.addEventListener("keydown", event => {
  if (event.repeat) return;
  if (event.code === "KeyE") respond("left", "keyboard");
  if (event.code === "KeyI") respond("right", "keyboard");
  if (event.code === "Space" && !el["instruction-card"].hidden) { event.preventDefault(); document.querySelector("#continue-button")?.click(); }
});
el["left-response"].addEventListener("pointerdown", () => respond("left", "touch"));
el["right-response"].addEventListener("pointerdown", () => respond("right", "touch"));
el["start-button"].addEventListener("click", start);
el["restart-button"].addEventListener("click", start);
el["download-button"].addEventListener("click", downloadData);
renderOverview();
