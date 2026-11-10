// IAT storage v1. The spreadsheet stays PRIVATE. No endpoint returns results.
const IAT_FILE_ID = "1RzEr-4xNB1oVIkXj35Fn48EKWujt0enh9jwpKfmAC58";
const IAT_LEGACY_FIELDS = [
  "participant_id", "group_number", "age", "gender", "education_level",
  "employment_status", "monthly_income", "religiosity",
  "block_1_mean_rt", "block_2_mean_rt", "block_3_mean_rt", "block_4_mean_rt",
  "block_5_mean_rt", "block_6_mean_rt", "block_7_mean_rt", "d_score", "d_short",
  "d_long", "percent_correct", "prop_rt_300", "exclude_criteria_met",
  "mean_rt_iranian_female", "mean_rt_iranian_male", "mean_rt_afghan_female",
  "mean_rt_afghan_male", "mean_rt_female_faces", "mean_rt_male_faces",
  "gender_rt_difference", "same_gender_advantage", "sdo_responses", "sdo_score",
  "mfq_responses", "mfq_domain_scores"
];
const IAT_DETAIL_FIELDS = ["iat_trials", "iat_quality", "iat_interpretation"];
const IAT_FIELDS = IAT_LEGACY_FIELDS.concat(IAT_DETAIL_FIELDS);
const IAT_DOMAINS = ["care", "equality", "proportionality", "loyalty", "authority", "purity"];
const IAT_SDO_KEYS = Array.from({length:16}, (_, i) => "sdo_" + String(i+1).padStart(2,"0"));
const IAT_MFQ_KEYS = Array.from({length:36}, (_, i) => "mfq_" + String(i+1).padStart(2,"0"));
// Append new columns after the entire original layout, preserving old rows.
const IAT_LEGACY_HEADERS = IAT_LEGACY_FIELDS.concat(IAT_SDO_KEYS, IAT_MFQ_KEYS,
  IAT_DOMAINS.map(k => "mfq_" + k), ["received_at", "payload_sha256", "payload_json"]);
const IAT_DETAILS_HEADERS = IAT_LEGACY_HEADERS.concat(IAT_DETAIL_FIELDS);
const IAT_NATIONALITY_HEADERS = ["mean_rt_iranian_faces", "mean_rt_afghan_faces", "nationality_rt_difference"];
const IAT_HEADERS = IAT_DETAILS_HEADERS.concat(IAT_NATIONALITY_HEADERS);

function doGet() {
  return output_({service:"iat-sheets", schema_version:1, fields:IAT_FIELDS, iat_details_version:1, nationality_means_version:1});
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function canonical_(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical_).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ":" + canonical_(value[k])).join(",") + "}";
  return JSON.stringify(value);
}

function digest_(body) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8)
    .map(b => ((b+256)%256).toString(16).padStart(2,"0")).join("");
}

function object_(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys_(value, keys) {
  return object_(value) && Object.keys(value).length === keys.length
    && keys.every(k => Object.prototype.hasOwnProperty.call(value,k));
}

function valid_(p) {
  // Old completed/offline submissions retain their original payload and hash.
  if (!exactKeys_(p,IAT_LEGACY_FIELDS) && !exactKeys_(p,IAT_FIELDS)) return false;
  if (Object.prototype.hasOwnProperty.call(p,"iat_trials") && !validIatDetails_(p)) return false;
  if (typeof p.participant_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.participant_id)) return false;
  if (![1,2].includes(p.group_number) || !Number.isInteger(p.age) || p.age<20 || p.age>40) return false;
  const text = ["gender","education_level","employment_status","monthly_income","religiosity"];
  if (!text.every(k => typeof p[k] === "string" && p[k].length>0 && p[k].length<=300)) return false;
  const nonNumeric = ["participant_id","group_number","age","exclude_criteria_met",
    "sdo_responses","mfq_responses","mfq_domain_scores"].concat(text);
  const numeric = IAT_LEGACY_FIELDS.filter(k => !nonNumeric.includes(k));
  // Uncomputable IAT scores are null in the existing browser JSON payload.
  if (!numeric.every(k => p[k]===null || typeof p[k]==="number" && Number.isFinite(p[k]))) return false;
  if (typeof p.exclude_criteria_met !== "boolean") return false;
  if (!exactKeys_(p.sdo_responses,IAT_SDO_KEYS) || !IAT_SDO_KEYS.every(k => Number.isInteger(p.sdo_responses[k]) && p.sdo_responses[k]>=1 && p.sdo_responses[k]<=5)) return false;
  if (!exactKeys_(p.mfq_responses,IAT_MFQ_KEYS) || !IAT_MFQ_KEYS.every(k => Number.isInteger(p.mfq_responses[k]) && p.mfq_responses[k]>=0 && p.mfq_responses[k]<=4)) return false;
  return exactKeys_(p.mfq_domain_scores,IAT_DOMAINS) && IAT_DOMAINS.every(k =>
    typeof p.mfq_domain_scores[k]==="number" && Number.isFinite(p.mfq_domain_scores[k])
    && p.mfq_domain_scores[k]>=0 && p.mfq_domain_scores[k]<=4);
}

function validIatDetails_(p) {
  const trials=p.iat_trials, q=p.iat_quality, interpretation=p.iat_interpretation;
  if (!Array.isArray(trials) || trials.length>180 || !object_(q) || !object_(interpretation)) return false;
  const trialKeys=["trial","block","category","stimulus","expected","initial","response","method","correct","first_rt","rt"];
  if (!trials.every((t,i) => exactKeys_(t,trialKeys) && t.trial===i+1
    && Number.isInteger(t.block) && t.block>=1 && t.block<=7
    && ["targetA","targetB","attributeA","attributeB"].includes(t.category)
    && typeof t.stimulus==="string" && t.stimulus.length>0 && t.stimulus.length<=100
    && ["left","right"].includes(t.expected) && ["left","right"].includes(t.initial)
    && t.response===t.expected && ["keyboard","touch"].includes(t.method)
    && typeof t.correct==="boolean" && t.correct===(t.initial===t.expected)
    && Number.isSafeInteger(t.first_rt) && t.first_rt>=0
    && Number.isSafeInteger(t.rt) && t.rt>=t.first_rt)) return false;
  const reasons=["incomplete_test_blocks","invalid_latency","empty_scoring_cell","insufficient_scoring_trials","zero_variance","nonfinite_d_score","too_many_fast_responses"];
  if (q.scoring_version!=="millisecond-corrected-rt-v1" || typeof q.valid!=="boolean" || typeof q.excluded!=="boolean"
    || !Array.isArray(q.reasons) || q.reasons.length>reasons.length || !q.reasons.every(r=>reasons.includes(r))
    || q.excluded!==(q.reasons.length>0) || (!q.valid && !q.excluded)
    || p.exclude_criteria_met!==q.excluded) return false;
  if (!["total_test_trials","retained_trials","slow_trials","fast_trials"].every(k=>Number.isInteger(q[k]) && q[k]>=0 && q[k]<=120)) return false;
  const cells=["compatible-short","compatible-long","incompatible-short","incompatible-long"];
  if (!exactKeys_(q.cell_counts,cells) || !cells.every(k=>Number.isInteger(q.cell_counts[k]) && q.cell_counts[k]>=0 && q.cell_counts[k]<=120)) return false;
  if (!exactKeys_(interpretation,["status","direction","strength"])) return false;
  if (!q.valid || q.excluded) return interpretation.status===(q.valid?"excluded":"invalid")
    && interpretation.direction===null && interpretation.strength===null;
  if (![p.d_score,p.d_short,p.d_long].every(v=>typeof v==="number" && Number.isFinite(v))) return false;
  const d=p.d_score, magnitude=Math.abs(d);
  return interpretation.status==="valid"
    && interpretation.direction===(magnitude<=0.15?"little_to_no":d>0?"iranian":"afghan")
    && interpretation.strength===(magnitude>=0.65?"strong":magnitude>0.35?"moderate":magnitude>0.15?"slight":"little_to_no");
}

function cell_(value) {
  if (value===null) return "";
  if (typeof value==="object") return canonical_(value);
  // Keep spreadsheet formulas out of cells; payload_json preserves raw values.
  if (typeof value==="string" && /^\s*[=+@-]/.test(value)) return "\u200b" + value;
  return value;
}

function nationalityFaceMeans_(p) {
  // Use each retained face trial directly, regardless of depicted gender.
  // No raw IAT in old 33-field records: leave these columns blank.
  const totals={targetA:{sum:0,count:0},targetB:{sum:0,count:0}};
  for (const t of p.iat_trials || []) {
    if (![3,4,6,7].includes(t.block) || !Number.isFinite(t.rt) || t.rt<0 || t.rt>10000) continue;
    const group=totals[t.category];
    if (group) {group.sum+=t.rt;group.count++;}
  }
  const iranian=totals.targetA.count ? totals.targetA.sum/totals.targetA.count : null;
  const afghan=totals.targetB.count ? totals.targetB.sum/totals.targetB.count : null;
  return [iranian,afghan,iranian===null || afghan===null ? null : afghan-iranian];
}

function doPost(e) {
  // Browser sends URL-encoded "data" to avoid a cross-origin JSON preflight.
  // A readable JSON receipt, NOT an opaque no-cors response, confirms saving.
  const raw = e && e.parameter && e.parameter.data;
  if (typeof raw!=="string" || raw.length>200000) return output_({saved:false,error:"invalid_request"});
  let envelope;
  try { envelope=JSON.parse(raw); } catch (_) { return output_({saved:false,error:"invalid_json"}); }
  if (!exactKeys_(envelope,["schema_version","kind","payload"]) || envelope.schema_version!==1
    || !["results","probe"].includes(envelope.kind) || !valid_(envelope.payload)) {
    return output_({saved:false,error:"invalid_results"});
  }
  const p=envelope.payload;
  const body=canonical_(p);
  // Google Sheets cells have a 50,000 character limit. Never silently truncate.
  if (body.length>49000) return output_({saved:false,error:"payload_too_large"});
  const hash=digest_(body);
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(20000)) return output_({saved:false,error:"busy"});
  try {
    const file=SpreadsheetApp.openById(IAT_FILE_ID);
    const tab=envelope.kind==="probe" ? "StorageChecks" : "Results";
    let sheet=file.getSheetByName(tab);
    if (!sheet) sheet=file.insertSheet(tab);
    if (sheet.getMaxColumns()<IAT_HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(),IAT_HEADERS.length-sheet.getMaxColumns());
    }
    if (sheet.getLastRow()===0) {
      sheet.getRange(1,1,1,IAT_HEADERS.length).setValues([IAT_HEADERS]);
      sheet.setFrozenRows(1);
    } else {
      const headers=sheet.getRange(1,1,1,IAT_HEADERS.length).getValues()[0];
      if (JSON.stringify(headers)!==JSON.stringify(IAT_HEADERS)) {
        const previous=[IAT_LEGACY_HEADERS,IAT_DETAILS_HEADERS].find(prefix =>
          JSON.stringify(headers.slice(0,prefix.length))===JSON.stringify(prefix)
          && headers.slice(prefix.length).every(value=>value===""));
        if (!previous) return output_({saved:false,error:"headers_changed"});
        const appended=IAT_HEADERS.slice(previous.length);
        sheet.getRange(1,previous.length+1,1,appended.length).setValues([appended]);
      }
    }
    const count=sheet.getLastRow()-1;
    if (count>0) {
      const hits=sheet.getRange(2,1,count,1).createTextFinder(p.participant_id)
        .matchEntireCell(true).useRegularExpression(false).findAll();
      if (hits.length>1) return output_({saved:false,error:"duplicate_rows_detected"});
      if (hits.length===1) {
        const old=sheet.getRange(hits[0].getRow(),1,1,IAT_HEADERS.length).getValues()[0];
        if (old[IAT_HEADERS.indexOf("payload_sha256")]!==hash
          || old[IAT_HEADERS.indexOf("payload_json")]!==body) return output_({saved:false,error:"id_conflict"});
        return output_({saved:true,participant_id:p.participant_id,payload_sha256:hash,duplicate:true});
      }
    }
    const row=IAT_LEGACY_FIELDS.map(k => cell_(p[k]))
      .concat(IAT_SDO_KEYS.map(k => p.sdo_responses[k]),IAT_MFQ_KEYS.map(k => p.mfq_responses[k]),
        IAT_DOMAINS.map(k => p.mfq_domain_scores[k]),[new Date().toISOString(),hash,body],
        IAT_DETAIL_FIELDS.map(k => Object.prototype.hasOwnProperty.call(p,k) ? cell_(p[k]) : ""),
        nationalityFaceMeans_(p).map(cell_));
    const next=sheet.getLastRow()+1;
    if (next>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),100);
    sheet.getRange(next,1,1,row.length).setValues([row]);
    SpreadsheetApp.flush();
    const stored=sheet.getRange(next,1,1,row.length).getValues()[0];
    if (!row.every((value,index) => value===stored[index])) return output_({saved:false,error:"verification_failed"});
    return output_({saved:true,participant_id:p.participant_id,payload_sha256:hash,duplicate:false});
  } catch (_) {
    // Never expose spreadsheet contents, account data, or raw platform errors.
    return output_({saved:false,error:"storage_unavailable"});
  } finally {
    lock.releaseLock();
  }
}
