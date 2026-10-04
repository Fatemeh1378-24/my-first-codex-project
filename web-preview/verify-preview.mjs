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
const questionnaireData = fs.readFileSync(new URL("questionnaire-data.js", import.meta.url), "utf8");
const mfqScoring = fs.readFileSync(new URL("mfq-scoring.js", import.meta.url), "utf8");
const sdoData = fs.readFileSync(new URL("sdo-data.js", import.meta.url), "utf8");
const sdoScoring = fs.readFileSync(new URL("sdo-scoring.js", import.meta.url), "utf8");
const inquisit = fs.readFileSync(new URL("../pictureiat_inc.iqjs", import.meta.url), "utf8");
const definitions = source.slice(0, source.indexOf('document.addEventListener("keydown"'));
const requests = [];
let responseStatus = 201;
const context = {
  document: { querySelectorAll: () => [] },
  location: { search: "?group=1" },
  crypto: webcrypto, URL, URLSearchParams, console,
  fetch: async (...args) => {
    requests.push(args);
    return { ok: responseStatus >= 200 && responseStatus < 300, status: responseStatus };
  }
};
vm.createContext(context);
vm.runInContext(`${sdoData}\n${sdoScoring}\n${questionnaireData}\n${mfqScoring}`, context);
vm.runInContext(`${definitions}\nthis.preview = { buildSequence, labelsFor, responseCue, instructionFor, calculateScores, generateParticipantId, isEligibleAge, participantInsertPayload, saveParticipantResults, SESSION_PARTICIPANT_ID, SESSION_GROUP, state, RESPONSES };`, context);

const { buildSequence, labelsFor, responseCue, instructionFor, calculateScores, generateParticipantId, isEligibleAge, participantInsertPayload, saveParticipantResults, SESSION_PARTICIPANT_ID, SESSION_GROUP, state, RESPONSES } = context.preview;
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
    const labels = labelsFor(block);
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
    if (block.kind === "combined") {
      assert.match(instruction, / یا /);
      assert.match(labels.left, /^<span class="combined-label"><span class="attribute-label">(?:خوب|بد)<\/span><span class="joiner">یا<\/span><span class="target-label">(?:ایرانی|افغان)<\/span><\/span>$/);
      assert.match(labels.right, /^<span class="combined-label"><span class="attribute-label">(?:خوب|بد)<\/span><span class="joiner">یا<\/span><span class="target-label">(?:ایرانی|افغان)<\/span><\/span>$/);
    } else {
      assert.doesNotMatch(`${labels.left}${labels.right}`, /combined-label|joiner/, `group ${group}, block ${block.part}: combined styles stay scoped`);
    }
    assert.equal((`${labels.left}${responseCue("left")}`.match(/data-response-side="left"/g) || []).length, 1, `group ${group}, block ${block.part}: one left cue`);
    assert.equal((`${labels.right}${responseCue("right")}`.match(/data-response-side="right"/g) || []).length, 1, `group ${group}, block ${block.part}: one right cue`);
  }
}

assert.equal(RESPONSES.left.code, "KeyE");
assert.equal(RESPONSES.right.code, "KeyI");
assert.match(responseCue("left"), />\(E\)<[\s\S]*>\(سمت چپ\)</);
assert.match(responseCue("right"), />\(I\)<[\s\S]*>\(سمت راست\)</);
assert.match(css, /\.combined-label, \.combined-label \.attribute-label, \.combined-label \.joiner, \.combined-label \.target-label \{ color: #fff; \}/);
assert.match(css, /\.joiner \{[^}]*font-weight: 700;/);
assert.match(css, /\.attribute-label \{ color: var\(--green\); \}/);
assert.match(css, /\.response-cue \{[^}]*color: var\(--muted\);/);
assert.match(source, /event\.code === RESPONSES\.left\.code\) respond\("left", "keyboard"\)/);
assert.match(source, /event\.code === RESPONSES\.right\.code\) respond\("right", "keyboard"\)/);
assert.match(source, /left-response"\]\.addEventListener\("pointerdown", \(\) => respond\("left", "touch"\)\)/);
assert.match(source, /right-response"\]\.addEventListener\("pointerdown", \(\) => respond\("right", "touch"\)\)/);
assert.match(inquisit, /<trial attributeA>[\s\S]*?correctResponse = \("E"\)/);
assert.match(inquisit, /<trial attributeB>[\s\S]*?correctResponse = \("I"\)/);
assert.equal((inquisit.match(/<text leftResponseCueMixed>/g) || []).length, 1);
assert.equal((inquisit.match(/<text rightResponseCueMixed>/g) || []).length, 1);
for (const label of ["attributeALeftMixed", "attributeBRightMixed", "targetALeftMixed", "targetARightMixed", "targetBLeftMixed", "targetBRightMixed"]) {
  const start = inquisit.indexOf(`<text ${label}>`);
  const definition = inquisit.slice(start, inquisit.indexOf("</text>", start));
  assert.match(definition, /txColor = white/, `${label}: combined category label remains white`);
  assert.match(definition, /fontStyle = \("Vazirmatn", 5%\)/, `${label}: combined category label uses Vazirmatn`);
}
const instructionsSource = fs.readFileSync(new URL("../pictureiat_instructions_inc.iqjs", import.meta.url), "utf8");
for (const joiner of ["orLeft", "orRight"]) {
  const start = instructionsSource.indexOf(`<text ${joiner}>`);
  const definition = instructionsSource.slice(start, instructionsSource.indexOf("</text>", start));
  assert.match(definition, /txColor = white/, `${joiner}: combined connector is white`);
  assert.match(definition, /fontStyle = \("Vazirmatn", 5%, true\)/, `${joiner}: combined connector is bold`);
}
for (const blockName of ["compatibleTest1", "compatibleTest2", "incompatibleTest1", "incompatibleTest2"]) {
  const start = inquisit.indexOf(`<block ${blockName}>`);
  const block = inquisit.slice(start, inquisit.indexOf("</block>", start));
  assert.equal((block.match(/leftResponseCueMixed/g) || []).length, 1, `${blockName}: one left cue`);
  assert.equal((block.match(/rightResponseCueMixed/g) || []).length, 1, `${blockName}: one right cue`);
  assert.equal((block.match(/attributeALeftMixed/g) || []).length, 1, `${blockName}: combined left attribute style`);
  assert.equal((block.match(/attributeBRightMixed/g) || []).length, 1, `${blockName}: combined right attribute style`);
}

assert.match(html, /id="left-response"[\s\S]*?<span class="key">E<\/span>/);
assert.match(html, /id="right-response"[\s\S]*?<span class="key">I<\/span>/);
assert.doesNotMatch(html, /<input[^>]+(?:participant[_-]?id|شناسه شرکت‌کننده)/i, "participant ID input must not exist");
assert.doesNotMatch(html, /name=["'](?:nationality|ethnicity)["']/i, "nationality and ethnicity fields must not exist");
const demographicNames = [...html.matchAll(/<(?:input|select)[^>]+name="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(demographicNames, ["age", "gender", "education_level", "employment_status", "monthly_income", "religiosity"], "only the six requested demographic fields should appear, in order");
assert.match(html, /این پاسخ‌ها و اطلاعات در راستای یک پژوهش علمی در چارچوب پایان‌نامه کارشناسی ارشد جمع‌آوری می‌شوند. از وقتی که برای شرکت در این پژوهش اختصاص می‌دهید، سپاسگزارم./);
assert.match(html, /ادامه و شروع آزمون/);
assert.equal(isEligibleAge(19), false);
assert.equal(isEligibleAge(20), true);
assert.equal(isEligibleAge(30), true);
assert.equal(isEligibleAge(31), false);
assert.equal(isEligibleAge(20.5), false);
assert.match(css, /font-family:\s*Vazirmatn, Tahoma, Arial, sans-serif/);
assert.match(css, /fonts\.googleapis\.com\/css2\?family=Vazirmatn/);
assert.match(css, /\.face-row img[^}]*object-fit: contain/);
assert.match(css, /\.stimulus img[^}]*object-fit: contain/);
assert.match(SESSION_PARTICIPANT_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.notEqual(generateParticipantId(), generateParticipantId(), "generated participant IDs should be unique");
assert.equal(state.participant.Participant_ID, SESSION_PARTICIPANT_ID);
assert.equal(state.participant.Group, SESSION_GROUP);
assert.equal(SESSION_GROUP, 1, "query-string counterbalancing assignment should be preserved");
assert.match(source, /state\.trials\.push\(\{ \.\.\.state\.participant, \.\.\.trial \}\)/, "raw trials must carry the session metadata");
assert.match(source, /scores = \{ \.\.\.state\.participant, \.\.\.calculateScores\(\) \}/, "score outputs must carry the session metadata");
assert.match(source, /fetch\(`\$\{SUPABASE_URL\}\/rest\/v1\/participants`/, "completed results must target public.participants through Supabase REST");
assert.match(source, /apikey: SUPABASE_PUBLISHABLE_KEY/);
assert.match(source, /Authorization: `Bearer \$\{SUPABASE_PUBLISHABLE_KEY\}`/);
assert.match(source, /body: JSON\.stringify\(participantInsertPayload\(scores\)\)/, "the completed participant score row must be mapped to the database schema");
assert.match(html, /id="save-status"[^>]*class="save-status"/);
assert.match(html, /id="retry-save-button"/);
assert.match(html, /از مشارکت شما در این پژوهش سپاسگزاریم./, "successful completion must thank the participant");
assert.match(html, /پاسخ‌های شما با موفقیت ثبت شد./, "successful completion must confirm that responses were saved");
assert.doesNotMatch(html, /id=["'](?:d-score|interpretation|quality-metrics)["']/, "completion UI must not contain score or quality output elements");
assert.doesNotMatch(html, /نمرهٔ D|دقت پاسخ اولیه|کمتر از ۳۰۰|نشانگر حذف|گروه موازنه‌سازی|Gender RT Difference|Same-Gender Advantage/, "completion UI must not disclose participant metrics");
assert.doesNotMatch(html, /id=["']restart-button["']|اجرای دوباره/, "successful completion must not offer a restart control");
assert.doesNotMatch(html, /id=["']download-button["']/i, "participant-facing trial-data download button must not exist");
assert.doesNotMatch(html, /دانلود داده‌های کوشش‌ها/, "participant-facing trial-data download label must not exist");
assert.doesNotMatch(source, /\bdownloadData\b|download-button/, "participant-facing trial-data download handler must not exist");
assert.doesNotMatch(source, /el\[(?:"|')d-score(?:"|')\]|el\.interpretation|quality-metrics/, "calculated metrics must not be rendered into the completion UI");
assert.match(source, /await saveParticipantResults\(state\.scores\);[\s\S]*?el\["completion-message"\]\.hidden = false;/, "success message must only appear after saving succeeds");
assert.match(source, /catch \(error\)[\s\S]*?el\["retry-save-button"\]\.hidden = false;/, "save failure must expose the retry control");

const resultRow = {
  Participant_ID: SESSION_PARTICIPANT_ID, Group: 1, Age: 25, Gender: "زن",
  Education_Level: "کارشناسی ارشد", Employment_Status: "دانشجو",
  Monthly_Income: "زیر ۲۵ میلیون تومان", Religiosity: "متوسط",
  D_score: 0.42, D_short: 0.31, D_long: 0.53,
  percentCorrect: 95, propRT300: 0.02, excludeCriteriaMet: false,
  Mean_RT_Iranian_Female: 510, Mean_RT_Iranian_Male: 520,
  Mean_RT_Afghan_Female: 610, Mean_RT_Afghan_Male: 620,
  Mean_RT_Female_Faces: 560, Mean_RT_Male_Faces: 570,
  Gender_RT_Difference: 10, Same_Gender_Advantage: 10
};
const expectedSupabaseColumns = [
  "participant_id", "group_number", "age", "gender", "education_level", "employment_status", "monthly_income", "religiosity", "d_score", "d_short", "d_long",
  "percent_correct", "prop_rt_300", "exclude_criteria_met",
  "mean_rt_iranian_female", "mean_rt_iranian_male",
  "mean_rt_afghan_female", "mean_rt_afghan_male",
  "mean_rt_female_faces", "mean_rt_male_faces",
  "gender_rt_difference", "same_gender_advantage"
  , "sdo_responses", "sdo_score", "mfq_responses", "mfq_domain_scores"
];
const mappedRow = participantInsertPayload(resultRow);
assert.deepEqual(Object.keys(mappedRow), expectedSupabaseColumns, "insert payload keys must exactly match public.participants columns");
assert.deepEqual(Object.values(mappedRow).slice(0, 22), Object.values(resultRow), "schema mapping must preserve every existing calculated value");
assert.deepEqual(Object.keys(mappedRow.sdo_responses), []);
assert.equal(mappedRow.sdo_score, null);
assert.deepEqual(Object.keys(mappedRow.mfq_responses), []);
assert.deepEqual(Object.keys(mappedRow.mfq_domain_scores), []);
await saveParticipantResults(resultRow);
assert.equal(requests.length, 1);
const [requestUrl, requestOptions] = requests[0];
assert.equal(requestUrl, "https://iiogctpamxbomtjdzred.supabase.co/rest/v1/participants");
assert.equal(requestOptions.method, "POST");
assert.equal(requestOptions.headers.apikey, "sb_publishable_BOV3oSNFL9JqF2TWbKhABg_FR3oon3d");
assert.equal(requestOptions.headers.Authorization, `Bearer ${requestOptions.headers.apikey}`);
assert.equal(requestOptions.headers.Prefer, "return=minimal", "the insert must not request the inserted row or upsert existing data");
assert.doesNotMatch(requestOptions.headers.Prefer, /return=representation|resolution=/);
assert.equal(requestOptions.body, JSON.stringify(mappedRow));

responseStatus = 204;
await saveParticipantResults(resultRow);
responseStatus = 200;
await assert.rejects(
  saveParticipantResults(resultRow),
  /Supabase request failed with status 200/,
  "only PostgREST's successful INSERT statuses should be accepted"
);

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

const sdo = vm.runInContext("SDO_QUESTIONNAIRE", context);
const expectedSdoTexts = [
  "بعضی از گروه‌های مردم باید سر جای خودشان نگه داشته شوند.",
  "احتمالاً این خوب است که بعضی گروه‌ها در بالا و گروه‌های دیگر در پایین باشند.",
  "یک جامعهٔ ایده‌آل مستلزم آن است که بعضی گروه‌ها در بالا و گروه‌های دیگر در پایین باشند.",
  "بعضی از گروه‌های مردم صرفاً از گروه‌های دیگر پست‌ترند.",
  "گروه‌هایی که در پایین قرار دارند، به همان اندازهٔ گروه‌های بالا شایسته‌اند.",
  "هیچ گروهی نباید بر جامعه مسلط باشد.",
  "گروه‌هایی که در پایین قرار دارند، نباید مجبور باشند سر جای خود بمانند.",
  "سلطهٔ گروهی اصل نادرستی است.",
  "نباید برای برابری گروه‌ها تلاش کنیم.",
  "نباید تلاش کنیم تضمین شود که هر گروه از کیفیت زندگی یکسانی برخوردار است.",
  "تلاش برای برابر کردن گروه‌ها ناعادلانه است.",
  "برابری گروه‌ها نباید هدف اصلی ما باشد.",
  "باید تلاش کنیم به همهٔ گروه‌ها فرصت برابری برای موفقیت بدهیم.",
  "باید هر کاری از دستمان برمی‌آید انجام دهیم تا شرایط گروه‌های مختلف را برابر کنیم.",
  "صرف‌نظر از اینکه چقدر تلاش لازم است، باید بکوشیم مطمئن شویم همهٔ گروه‌ها در زندگی فرصت یکسانی دارند.",
  "برابری گروه‌ها باید آرمان ما باشد."
];
assert.equal(sdo.items.length, 16, "SDO must contain exactly 16 items");
assert.deepEqual(Array.from(sdo.items, item => item.id), Array.from({ length: 16 }, (_, index) => `sdo_${String(index + 1).padStart(2, "0")}`));
assert.deepEqual(Array.from(sdo.items, item => item.text), expectedSdoTexts, "all Persian SDO7 texts must remain exact and ordered");
assert.deepEqual(Array.from(sdo.responseOptions, option => [option.value, option.label]), [
  ["1", "کاملاً مخالفم"], ["2", "مخالفم"], ["3", "تا حدی مخالفم"], ["4", "نه موافقم و نه مخالف"],
  ["5", "تا حدی موافقم"], ["6", "موافقم"], ["7", "کاملاً موافقم"]
]);
const reverseSdoItems = vm.runInContext("Array.from(SDO_SCORING.reverseScoredItems)", context);
assert.deepEqual(Array.from(reverseSdoItems), [5, 6, 7, 8, 13, 14, 15, 16]);
const rawSdo = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`sdo_${String(index + 1).padStart(2, "0")}`, index < 8 ? 7 : 1]));
context.rawSdo = rawSdo;
assert.equal(vm.runInContext("SDO_SCORING.calculate(rawSdo)", context), 4, "SDO score must mean all 16 keyed responses");
context.allHighSdo = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`sdo_${String(index + 1).padStart(2, "0")}`, 7]));
assert.equal(vm.runInContext("SDO_SCORING.calculate(allHighSdo)", context), 4, "reverse-keyed items must use 8 - raw response");
assert.throws(() => vm.runInContext("SDO_SCORING.calculate({})", context), /Missing or invalid SDO response: sdo_01/);
state.sdoResponses = rawSdo;
state.sdoScore = vm.runInContext("SDO_SCORING.calculate(rawSdo)", context);
const questionnairePayload = participantInsertPayload(resultRow);
assert.deepEqual(questionnairePayload.sdo_responses, rawSdo, "all 16 raw SDO responses must be retained in the payload");
assert.equal(questionnairePayload.sdo_score, 4, "the calculated SDO score must be retained in the payload");
assert.doesNotMatch(html, /id=["'](?:sdo-score|sdo-results)["']/i, "SDO results must not have participant-facing output elements");
assert.match(html, /<html lang="fa" dir="rtl">/);
assert.match(source, /state\.sdoScore = SDO_SCORING\.calculate\(responses\)/);

const mfq = vm.runInContext("MFQ_QUESTIONNAIRE", context);
const expectedMfqTexts = [
  "مراقبت از افراد رنج دیده یک فضیلت اخلاقی مهم است.", "اگر همه درآمد یکسانی داشتند دنیا جای بهتری می شد.", "فکر می کنم افرادی که سخت کوش تر هستند باید پول بیشتری عایدشان شود.",
  "بر این باورم که باید به کودکان وفاداری به کشورشان را آموزش داد.", "به نظر من گرامی داشتن ارزش های سنتی در هر جامعه ای مهم است.", "به نظر من با بدن انسان باید مانند کالبدی مقدس برخورد کرد که روح انسان را در خود نگاه می دارد.",
  "بر این باورم که مهربانی در حق افراد رنج دیده یکی از فضایل مهم اخلاقی است.", "اگر همۀ افراد جامعه درآمد یکسانی داشتند مشکلات کمتری در جامعه به وجود می آمد.", "به نظر من مردم باید متناسب با لیاقت شان پاداش دریافت کنند.",
  "وقتی افراد به کشورشان وفادار نیستند ناراحت می شوم.", "به نظر من آداب و رسوم به حفظ نظم در جامعه کمک می کنند.", "بر این باورم که نجابت و پاکدامنی یک فضیلت اخلاقی مهم است.",
  "همۀ ما باید مراقب کسانی که از لحاظ عاطفی درد می کشند باشیم.", "بر این باورم که همۀ انسان ها می بایست به یک میزان به پول و ثروت دسترسی داشته باشند.", "هر چه فردی برای شغل خود تلاش بیشتری کند باید حقوق و مزایای بیشتری نیز دریافت کند.",
  "همۀ افراد باید گروه خودشان را دوست داشته باشند.", "به نظر من حرف شنوی از والدین فضیلت اخلاقی مهمی است.", "اینکه افراد به راحتی فحش بدهند من را ناراحت می کند.",
  "نسبت به افرادی که در زندگی خود رنج کشیده اند احساس همدردی می کنم.", "بر این باورم که حالت ایده آل این است که در نهایت، تمامی افراد جامعه به مقدار یکسانی پول داشته باشند.", "اینکه افراد به خاطر شایستگی هایشان مورد تقدیر واقع شوند من را خوشحال می کند.",
  "همۀ افراد باید در صورت لزوم از کشور خود دفاع کنند.", "همۀ ما باید از بزرگترهایمان یاد بگیریم.", "اگر متوجه شوم که یکی از آشنایانم اعمال عجیب و غریب جنسی را دوست دارد، در مورد او احساس معذب بودن به من دست می دهد.",
  "همۀ افراد باید سعی کنند کسانی را که دوران سختی را می گذرانند دلداری دهند.", "وقتی افراد برای رسیدن به یک هدف مشترک با هم کار می کنند، پاداش باید به صورت یکسان بین آنها تقسیم شود، حتی اگر برخی بیشتر از دیگران تلاش کرده باشند.", "در یک جامعۀ منصف، کسانی که سخت تلاش می کنند باید در شرایط بهتری هم زندگی کنند.",
  "چنانچه فردی از یک کشور در یک مسابقه بین المللی برنده شد، تمامی افراد آن کشور باید احساس افتخار کنند.", "بر این باورم که یکی از مهم ترین ارزش هایی که باید به کودکان آموزش داده شود احترام گذاشتن به مراجع قدرت است.", "مردم باید سعی کنند از داروهای طبیعی (مانند داروهای عطاری ها) استفاده کنند؛ نه داروهای شیمیایی که ساختۀ شرکت های داروسازی هستند.",
  "اینکه فردی نیازهای یک انسان دیگر را نادیده بگیرد برایم بسیار دردناک است.", "وقتی می بینم در کشورم بعضی افراد پول خیلی بیشتری نسبت به بقیه دارند ناراحت می شوم.", "وقتی می بینم که افراد متقلب گیر می افتند و مجازات می شوند، حس خوبی به من دست می دهد.",
  "بر این باورم که قدرت یک تیم ورزشی از وفاداری و اعتماد اعضای آن تیم به یکدیگر نشأت می گیرد.", "به نظر من داشتن یک رهبر قدرتمند برای جامعه خوب است.", "افرادی را که بکارت خود را تا هنگام ازدواج حفظ می کنند تحسین می کنم."
];
assert.equal(mfq.items.length, 36, "MFQ must contain exactly 36 items");
assert.deepEqual(Array.from(mfq.items, item => item.id), Array.from({ length: 36 }, (_, index) => `mfq_${String(index + 1).padStart(2, "0")}`));
assert.deepEqual(Array.from(mfq.items, item => item.text), expectedMfqTexts, "all approved Persian MFQ-2 texts must remain exact and ordered");
assert.deepEqual(Array.from(mfq.responseOptions, option => [option.value, option.label]), [
  ["0", "اصلاً مرا توصیف نمی کند."], ["1", "کمی مرا توصیف می کند."], ["2", "تا حدی مرا توصیف می کند."],
  ["3", "به خوبی مرا توصیف می کند."], ["4", "خیلی خوب مرا توصیف می کند."]
]);
const rawMfq = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`mfq_${String(index + 1).padStart(2, "0")}`, (index + 1) % 5]));
context.rawMfq = rawMfq;
const domainScores = vm.runInContext("MFQ_SCORING.calculate(rawMfq)", context);
const memberships = {
  care: [1, 7, 13, 19, 25, 31], equality: [2, 8, 14, 20, 26, 32], proportionality: [3, 9, 15, 21, 27, 33],
  loyalty: [4, 10, 16, 22, 28, 34], authority: [5, 11, 17, 23, 29, 35], purity: [6, 12, 18, 24, 30, 36]
};
assert.deepEqual(Object.keys(domainScores), Object.keys(memberships), "only the six stable domain keys should be saved");
for (const [domain, numbers] of Object.entries(memberships)) {
  const expected = numbers.reduce((sum, number) => sum + rawMfq[`mfq_${String(number).padStart(2, "0")}`], 0) / 6;
  assert.equal(domainScores[domain], expected, `${domain} must be the mean of its six approved raw items`);
}
assert.equal(Object.hasOwn(domainScores, "total"), false, "MFQ must not produce an overall total");
assert.throws(() => vm.runInContext("MFQ_SCORING.calculate({})", context), /Missing or invalid MFQ response: mfq_01/);
assert.match(html, /لطفا هر یک از عبارت هایی را که در ادامه می آیند با دقت بخوانید و مشخص کنید که هر کدام تا چه اندازه شما یا نظرات شما را توصیف می‌کنند./);
assert.match(html, /id="post-iat-transition"[\s\S]*id="sdo-questionnaire"[\s\S]*id="mfq-questionnaire"[\s\S]*id="summary"/, "study sections must remain in the required order");
assert.match(source, /state\.sdoResponses = responses;[\s\S]*el\["mfq-questionnaire"\]\.hidden = false;/, "SDO completion must reveal MFQ");
assert.match(source, /if \(!responses\) return;[\s\S]*state\.mfqResponses = responses;[\s\S]*el\.summary\.hidden = false;/, "complete MFQ must reveal final page");
assert.match(source, /errorElement\.hidden = !firstMissing/, "missing questionnaire responses must show validation");

console.log("Verified dynamic instructions and response mappings for all 7 blocks in groups 1 and 2.");
console.log("Verified the exact six-field demographic form, age boundary validation, session linkage, and Vazirmatn styling.");
console.log("Verified E/left and I/right controls plus non-cropping overview and trial image styles.");
console.log("Verified that no participant-facing trial-data download control or handler exists.");
console.log("Verified that successful completion is score-free and terminal, while save failure retains retry.");
console.log("Verified D-score direction in both groups, component averaging, gender RT outputs, and >10% fast-response exclusion.");
console.log("Verified all 16 Persian SDO7 items, 1–7 responses, reverse scoring, final mean, validation, and Supabase payload fields.");
console.log("Verified the SDO-to-MFQ flow, exact MFQ-2 content, 0–4 responses, required-answer validation, and all six domain means.");
