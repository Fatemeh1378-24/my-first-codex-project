"use strict";

// Change category labels, words, and image paths here in later customizations.
const CONFIG = {
  isiMs: 250,
  errorMs: 200,
  categories: {
    attributeA: { label: "خوب", items: ["شگفت‌انگیز", "عالی", "لذت", "زیبا", "شاد", "باشکوه", "دوست‌داشتنی", "فوق‌العاده"] },
    attributeB: { label: "بد", items: ["غم‌انگیز", "وحشتناک", "عذاب", "دردناک", "هولناک", "بسیار بد", "تحقیر کردن", "زننده"] },
    targetA: { label: "ایرانی", items: ["Iranian_F1.jpg", "Iranian_F2.jpg", "Iranian_F3.jpg", "Iranian_M1.jpg", "Iranian_M2.jpg", "Iranian_M3.jpg"] },
    targetB: { label: "افغان", items: ["Afghan_F1.jpg", "Afghan_F2.jpg", "Afghan_F3.jpg", "Afghan_M1.jpg", "Afghan_M2.jpg", "Afghan_M3.jpg"] }
  }
};

const GENDER_LABELS = {
  female: "زن",
  male: "مرد",
  prefer_not_to_say: "ترجیح می‌دهم نگویم"
};

// This browser-safe publishable key is intentionally used directly by the
// static preview. Row-level security on public.participants remains the
// database-side authorization boundary; never replace it with a secret key.
const SUPABASE_URL = "https://iiogctpamxbomtjdzred.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BOV3oSNFL9JqF2TWbKhABg_FR3oon3d";

// Keep participant-facing instructions tied to the same response configuration
// used by the keyboard and touch handlers below.
const RESPONSES = {
  left: { key: "E", code: "KeyE", sideLabel: "سمت چپ" },
  right: { key: "I", code: "KeyI", sideLabel: "سمت راست" }
};

function generateParticipantId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

// Created once when this participant session loads. Restarting the IAT does not
// change either identifier or counterbalancing assignment.
const SESSION_PARTICIPANT_ID = generateParticipantId();
const requestedGroup = Number(new URLSearchParams(location.search).get("group"));
const SESSION_GROUP = requestedGroup === 1 || requestedGroup === 2 ? requestedGroup : (Math.random() < .5 ? 1 : 2);

const el = Object.fromEntries([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
const state = {
  blocks: [], blockIndex: 0, trialIndex: 0, trials: [], awaitingCorrection: false, locked: false, startedAt: 0,
  group: SESSION_GROUP,
  participant: { Participant_ID: SESSION_PARTICIPANT_ID, Group: SESSION_GROUP },
  sdoResponses: {}, sdoScore: null, mfqResponses: {}, mfqDomainScores: {}
};

function renderQuestionnaire(container, items, options) {
  container.innerHTML = items.map((item, index) => {
    const id = typeof item === "string" ? `sdo_${String(index + 1).padStart(2, "0")}` : item.id;
    const text = typeof item === "string" ? item : item.text;
    const choices = options.map(option => `<label class="scale-option"><input type="radio" name="${id}" value="${option.value}" required><span>${option.label}</span></label>`).join("");
    return `<fieldset class="questionnaire-item" data-question="${id}"><legend>${index + 1}. ${text}</legend><div class="scale-options">${choices}</div></fieldset>`;
  }).join("");
}

function collectRequiredResponses(form, items, errorElement) {
  const data = new FormData(form);
  const responses = {};
  let firstMissing = null;
  for (const item of items) {
    const id = typeof item === "string" ? `sdo_${String(items.indexOf(item) + 1).padStart(2, "0")}` : item.id;
    const fieldset = form.querySelector(`[data-question="${id}"]`);
    const value = data.get(id);
    fieldset.classList.toggle("missing", value === null);
    if (value === null && !firstMissing) firstMissing = fieldset;
    if (value !== null) responses[id] = Number(value);
  }
  errorElement.hidden = !firstMissing;
  firstMissing?.scrollIntoView({ behavior: "smooth", block: "center" });
  return firstMissing ? null : responses;
}

function isEligibleAge(value) {
  const age = Number(value);
  return Number.isInteger(age) && age >= 20 && age <= 30;
}

function collectDemographics(form) {
  const values = new FormData(form);
  const normalizedGender = values.get("gender");
  return {
    Age: Number(values.get("age")),
    Gender: GENDER_LABELS[normalizedGender],
    Gender_Normalized: normalizedGender,
    Education_Level: values.get("education_level"),
    Employment_Status: values.get("employment_status"),
    Monthly_Income: values.get("monthly_income"),
    Religiosity: values.get("religiosity")
  };
}

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
      ? `<div class="face-row">${category.items.map(src => `<img src="${src}" alt="تصویر چهره">`).join("")}</div>`
      : `<p>${category.items.join(" · ")}</p>`;
    return `<article class="overview-card"><p class="card-heading">دسته</p><h2>${category.label}</h2><p class="card-heading">موارد</p>${content}</article>`;
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
    left: `<span class="combined-label"><span class="attribute-label">${c.attributeA.label}</span><span class="joiner">یا</span><span class="target-label">${leftTarget}</span></span>`,
    right: `<span class="combined-label"><span class="attribute-label">${c.attributeB.label}</span><span class="joiner">یا</span><span class="target-label">${rightTarget}</span></span>`
  };
}

function responseCue(side) {
  const response = RESPONSES[side];
  return `<span class="response-cue" data-response-side="${side}"><span dir="ltr">(${response.key})</span><span dir="rtl">(${response.sideLabel})</span></span>`;
}

function instructionFor(block) {
  const c = CONFIG.categories;
  const heading = `<h2>بخش ${block.part} از ۷</h2>`;
  const speed = `<p>لطفاً تا حد امکان سریع پاسخ دهید.</p>`;
  const error = `<p>اگر اشتباه کنید، یک علامت × قرمز ظاهر می‌شود؛ برای ادامه، پاسخ دیگر را انتخاب کنید.</p>`;
  const begin = `<p>برای شروع، کلید فاصله را فشار دهید.</p>`;

  const categoryPhrase = category => category === "attributeA"
    ? `یک کلمه ${c.attributeA.label}`
    : category === "attributeB"
      ? `یک کلمه ${c.attributeB.label}`
      : category === "targetA"
        ? `چهره یک فرد ${c.targetA.label}`
        : `چهره یک فرد ${c.targetB.label}`;
  const categoriesForSide = side => {
    const relevant = block.kind === "attribute"
      ? ["attributeA", "attributeB"]
      : block.kind === "target"
        ? ["targetA", "targetB"]
        : ["attributeA", "attributeB", "targetA", "targetB"];
    return relevant.filter(category => block.mapping[category] === side);
  };
  const responseInstruction = side => {
    const response = RESPONSES[side];
    const stimulus = categoriesForSide(side).map(categoryPhrase).join(" یا ");
    return `اگر ${stimulus} را دیدید، در کامپیوتر یا لپ‌تاپ کلید <strong>${response.key}</strong> مربوط به پاسخ ${response.sideLabel} را فشار دهید؛ اگر با گوشی یا تبلت آزمون را انجام می‌دهید، دکمه ${response.sideLabel} صفحه را لمس کنید.`;
  };
  const mappings = `<p class="response-instructions">${responseInstruction("left")}<br><br>${responseInstruction("right")}</p>`;
  if (block.part === 1) return `${heading}${mappings}<p>محرک‌ها یکی‌یکی در وسط صفحه ظاهر می‌شوند.</p>${error}${speed}${begin}`;
  if (block.part === 2) return `${heading}${mappings}${error}${speed}${begin}`;
  if (block.part === 5) return `${heading}<p><strong>توجه! جای برچسب‌ها عوض شده است.</strong></p>${mappings}${speed}${begin}`;
  const same = block.continuation ? `<p>این تکلیف همان تکلیف بخش قبلی است.</p>` : "";
  const oneCategory = block.part === 3 || block.continuation ? `<p>هر مورد فقط به یکی از دسته‌ها تعلق دارد.</p>` : "";
  return `${heading}${same}${mappings}${oneCategory}${block.continuation ? "" : error}${speed}${begin}`;
}

function start(event) {
  event?.preventDefault();
  const form = el["demographic-form"];
  const eligibleAge = isEligibleAge(el.age.value);
  el["age-error"].hidden = eligibleAge;
  if (!eligibleAge || !form.checkValidity()) {
    if (!eligibleAge) el.age.focus();
    else form.reportValidity();
    return;
  }
  state.participant = { ...state.participant, ...collectDemographics(form) };
  state.blocks = buildSequence(state.group);
  state.blockIndex = 0; state.trialIndex = 0; state.trials = []; state.locked = false;
  el.intro.hidden = true; el.summary.hidden = true; el.task.hidden = false;
  showInstruction();
}

function showInstruction() {
  const block = state.blocks[state.blockIndex];
  const labels = labelsFor(block);
  el["left-category"].innerHTML = `${labels.left}${responseCue("left")}`;
  el["right-category"].innerHTML = `${labels.right}${responseCue("right")}`;
  el["part-label"].textContent = `بخش ${block.part} از ۷`;
  el["trial-label"].textContent = "دستورالعمل‌ها";
  el["progress-fill"].style.width = `${(state.blockIndex / state.blocks.length) * 100}%`;
  el.stimulus.hidden = true; el.error.hidden = true; el["response-controls"].hidden = true; el["key-hint"].hidden = true;
  el["instruction-card"].innerHTML = `${instructionFor(block)}<button class="primary-button" type="button" id="continue-button">شروع این بخش</button>`;
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
  el["trial-label"].textContent = `کوشش ${state.trialIndex + 1} از ${block.count}`;
  el["progress-fill"].style.width = `${((state.blockIndex + state.trialIndex / block.count) / state.blocks.length) * 100}%`;
  if (trial.category.startsWith("target")) {
    el.stimulus.className = "stimulus";
    el.stimulus.innerHTML = `<img src="${trial.value}" alt="محرک چهره">`;
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
  state.trials.push({ ...state.participant, ...trial });
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

function calculateScores(trials = state.trials, participantGender = state.participant?.Gender_Normalized ?? "prefer_not_to_say") {
  // Millisecond's correction-required variant records latency to the final,
  // correct response. Accordingly, t.latency (not firstLatency) is scored.
  // Block means intentionally include every recorded trial in that block. The
  // D-score's latency eligibility rules below remain limited to its test blocks.
  const blockMeanRts = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
    const part = index + 1;
    return [`block_${part}_mean_rt`, mean(trials.filter(t => t.part === part).map(t => t.latency))];
  }));
  const testTrials = trials.filter(t => [3, 4, 6, 7].includes(t.part));
  const eligible = testTrials.filter(t => t.latency <= 10000);
  const cells = {};
  for (const condition of ["compatible", "incompatible"]) for (const length of ["short", "long"])
    cells[`${condition}-${length}`] = eligible.filter(t => t.condition === condition && t.blockLength === length).map(t => t.latency);
  const shortPooled = [...cells["compatible-short"], ...cells["incompatible-short"]];
  const longPooled = [...cells["compatible-long"], ...cells["incompatible-long"]];
  // Reversed minus Iranian+Good makes positive D mean a pro-Iranian association,
  // regardless of which condition was presented first.
  const D_short = (mean(cells["incompatible-short"]) - mean(cells["compatible-short"])) / sampleSd(shortPooled);
  const D_long = (mean(cells["incompatible-long"]) - mean(cells["compatible-long"])) / sampleSd(longPooled);
  const faceMean = (targetCategory, gender) => mean(eligible
    .filter(t => t.category === targetCategory && new RegExp(`_${gender}[0-9]+\\.jpg$`, "i").test(t.value))
    .map(t => t.latency));
  const Mean_RT_Iranian_Female = faceMean("targetA", "F");
  const Mean_RT_Iranian_Male = faceMean("targetA", "M");
  const Mean_RT_Afghan_Female = faceMean("targetB", "F");
  const Mean_RT_Afghan_Male = faceMean("targetB", "M");
  const Mean_RT_Female_Faces = mean(eligible.filter(t => /^target/.test(t.category) && /_F[0-9]+\.jpg$/i.test(t.value)).map(t => t.latency));
  const Mean_RT_Male_Faces = mean(eligible.filter(t => /^target/.test(t.category) && /_M[0-9]+\.jpg$/i.test(t.value)).map(t => t.latency));
  const Gender_RT_Difference = Mean_RT_Male_Faces - Mean_RT_Female_Faces;
  const Same_Gender_Advantage = participantGender === "female" ? Gender_RT_Difference
    : participantGender === "male" ? -Gender_RT_Difference : null;
  return {
    ...blockMeanRts,
    D_score: (D_short + D_long) / 2, D_short, D_long,
    percentCorrect: mean(eligible.map(t => t.initialCorrect ? 1 : 0)) * 100,
    propRT300: mean(testTrials.map(t => t.latency < 300 ? 1 : 0)),
    excludeCriteriaMet: mean(testTrials.map(t => t.latency < 300 ? 1 : 0)) > 0.10,
    Mean_RT_Iranian_Female, Mean_RT_Iranian_Male,
    Mean_RT_Afghan_Female, Mean_RT_Afghan_Male,
    Mean_RT_Female_Faces, Mean_RT_Male_Faces,
    Gender_RT_Difference, Same_Gender_Advantage
  };
}

function participantInsertPayload(scores) {
  return {
    participant_id: scores.Participant_ID,
    group_number: scores.Group,
    age: scores.Age,
    gender: scores.Gender,
    education_level: scores.Education_Level,
    employment_status: scores.Employment_Status,
    monthly_income: scores.Monthly_Income,
    religiosity: scores.Religiosity,
    block_1_mean_rt: scores.block_1_mean_rt,
    block_2_mean_rt: scores.block_2_mean_rt,
    block_3_mean_rt: scores.block_3_mean_rt,
    block_4_mean_rt: scores.block_4_mean_rt,
    block_5_mean_rt: scores.block_5_mean_rt,
    block_6_mean_rt: scores.block_6_mean_rt,
    block_7_mean_rt: scores.block_7_mean_rt,
    d_score: scores.D_score,
    d_short: scores.D_short,
    d_long: scores.D_long,
    percent_correct: scores.percentCorrect,
    prop_rt_300: scores.propRT300,
    exclude_criteria_met: scores.excludeCriteriaMet,
    mean_rt_iranian_female: scores.Mean_RT_Iranian_Female,
    mean_rt_iranian_male: scores.Mean_RT_Iranian_Male,
    mean_rt_afghan_female: scores.Mean_RT_Afghan_Female,
    mean_rt_afghan_male: scores.Mean_RT_Afghan_Male,
    mean_rt_female_faces: scores.Mean_RT_Female_Faces,
    mean_rt_male_faces: scores.Mean_RT_Male_Faces,
    gender_rt_difference: scores.Gender_RT_Difference,
    same_gender_advantage: scores.Same_Gender_Advantage,
    sdo_responses: state.sdoResponses,
    sdo_score: state.sdoScore ?? null,
    mfq_responses: state.mfqResponses,
    mfq_domain_scores: state.mfqDomainScores
  };
}

async function saveParticipantResults(scores) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/participants`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(participantInsertPayload(scores))
  });
  if (response.status !== 201 && response.status !== 204) {
    throw new Error(`Supabase request failed with status ${response.status}`);
  }
}

async function submitResults() {
  el["completion-message"].hidden = true;
  el["save-result"].hidden = false;
  el["save-status"].className = "save-status saving";
  el["save-status"].textContent = "در حال ثبت پاسخ‌های شما…";
  el["retry-save-button"].hidden = true;
  try {
    await saveParticipantResults(state.scores);
    el["save-result"].hidden = true;
    el["completion-message"].hidden = false;
  } catch (error) {
    console.error("Unable to save completed IAT results.", error);
    el["save-status"].className = "save-status failed";
    el["save-status"].textContent = "ذخیره نتایج انجام نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.";
    el["retry-save-button"].hidden = false;
  }
}

function finish() {
  const scores = { ...state.participant, ...calculateScores() };
  state.scores = scores;
  el.task.hidden = true; el["post-iat-transition"].hidden = false;
}

function showSdo() {
  el["post-iat-transition"].hidden = true;
  el["sdo-questionnaire"].hidden = false;
  scrollTo({ top: 0 });
}

function submitSdo(event) {
  event.preventDefault();
  const responses = collectRequiredResponses(event.currentTarget, SDO_QUESTIONNAIRE.items, el["sdo-error"]);
  if (!responses) return;
  state.sdoResponses = responses;
  state.sdoScore = SDO_SCORING.calculate(responses);
  el["sdo-questionnaire"].hidden = true;
  el["mfq-questionnaire"].hidden = false;
  scrollTo({ top: 0 });
}

function submitMfq(event) {
  event.preventDefault();
  const responses = collectRequiredResponses(event.currentTarget, MFQ_QUESTIONNAIRE.items, el["mfq-error"]);
  if (!responses) return;
  state.mfqResponses = responses;
  state.mfqDomainScores = MFQ_SCORING.calculate(responses);
  el["mfq-questionnaire"].hidden = true;
  el.summary.hidden = false;
  submitResults();
}

document.addEventListener("keydown", event => {
  if (event.repeat) return;
  if (event.code === RESPONSES.left.code) respond("left", "keyboard");
  if (event.code === RESPONSES.right.code) respond("right", "keyboard");
  if (event.code === "Space" && !el["instruction-card"].hidden) { event.preventDefault(); document.querySelector("#continue-button")?.click(); }
});
el["left-response"].addEventListener("pointerdown", () => respond("left", "touch"));
el["right-response"].addEventListener("pointerdown", () => respond("right", "touch"));
el["demographic-form"].addEventListener("submit", start);
el.age.addEventListener("input", () => { el["age-error"].hidden = isEligibleAge(el.age.value); });
el["retry-save-button"].addEventListener("click", submitResults);
renderQuestionnaire(el["sdo-items"], SDO_QUESTIONNAIRE.items, SDO_QUESTIONNAIRE.responseOptions);
renderQuestionnaire(el["mfq-items"], MFQ_QUESTIONNAIRE.items, MFQ_QUESTIONNAIRE.responseOptions);
el["start-sdo-button"].addEventListener("click", showSdo);
el["sdo-form"].addEventListener("submit", submitSdo);
el["mfq-form"].addEventListener("submit", submitMfq);
