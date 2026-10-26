// IAT storage v1. The spreadsheet stays PRIVATE. No endpoint returns results.
const IAT_FILE_ID = "1RzEr-4xNB1oVIkXj35Fn48EKWujt0enh9jwpKfmAC58";
const IAT_FIELDS = [
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
const IAT_DOMAINS = ["care", "equality", "proportionality", "loyalty", "authority", "purity"];
const IAT_SDO_KEYS = Array.from({length:16}, (_, i) => "sdo_" + String(i+1).padStart(2,"0"));
const IAT_MFQ_KEYS = Array.from({length:36}, (_, i) => "mfq_" + String(i+1).padStart(2,"0"));
const IAT_HEADERS = IAT_FIELDS.concat(IAT_SDO_KEYS, IAT_MFQ_KEYS,
  IAT_DOMAINS.map(k => "mfq_" + k), ["received_at", "payload_sha256", "payload_json"]);

function doGet() {
  return output_({service:"iat-sheets", schema_version:1, fields:IAT_FIELDS});
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
  if (!exactKeys_(p,IAT_FIELDS)) return false;
  if (typeof p.participant_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.participant_id)) return false;
  if (![1,2].includes(p.group_number) || !Number.isInteger(p.age) || p.age<20 || p.age>40) return false;
  const text = ["gender","education_level","employment_status","monthly_income","religiosity"];
  if (!text.every(k => typeof p[k] === "string" && p[k].length>0 && p[k].length<=300)) return false;
  const nonNumeric = ["participant_id","group_number","age","exclude_criteria_met",
    "sdo_responses","mfq_responses","mfq_domain_scores"].concat(text);
  const numeric = IAT_FIELDS.filter(k => !nonNumeric.includes(k));
  // Uncomputable IAT scores are null in the existing browser JSON payload.
  if (!numeric.every(k => p[k]===null || typeof p[k]==="number" && Number.isFinite(p[k]))) return false;
  if (typeof p.exclude_criteria_met !== "boolean") return false;
  if (!exactKeys_(p.sdo_responses,IAT_SDO_KEYS) || !IAT_SDO_KEYS.every(k => Number.isInteger(p.sdo_responses[k]) && p.sdo_responses[k]>=1 && p.sdo_responses[k]<=5)) return false;
  if (!exactKeys_(p.mfq_responses,IAT_MFQ_KEYS) || !IAT_MFQ_KEYS.every(k => Number.isInteger(p.mfq_responses[k]) && p.mfq_responses[k]>=0 && p.mfq_responses[k]<=4)) return false;
  return exactKeys_(p.mfq_domain_scores,IAT_DOMAINS) && IAT_DOMAINS.every(k =>
    typeof p.mfq_domain_scores[k]==="number" && Number.isFinite(p.mfq_domain_scores[k])
    && p.mfq_domain_scores[k]>=0 && p.mfq_domain_scores[k]<=4);
}

function cell_(value) {
  if (value===null) return "";
  if (typeof value==="object") return canonical_(value);
  // Keep spreadsheet formulas out of cells; payload_json preserves raw values.
  if (typeof value==="string" && /^\s*[=+@-]/.test(value)) return "\u200b" + value;
  return value;
}

function doPost(e) {
  // Browser sends URL-encoded "data" to avoid a cross-origin JSON preflight.
  // A readable JSON receipt, NOT an opaque no-cors response, confirms saving.
  const raw = e && e.parameter && e.parameter.data;
  if (typeof raw!=="string" || raw.length>40000) return output_({saved:false,error:"invalid_request"});
  let envelope;
  try { envelope=JSON.parse(raw); } catch (_) { return output_({saved:false,error:"invalid_json"}); }
  if (!exactKeys_(envelope,["schema_version","kind","payload"]) || envelope.schema_version!==1
    || !["results","probe"].includes(envelope.kind) || !valid_(envelope.payload)) {
    return output_({saved:false,error:"invalid_results"});
  }
  const p=envelope.payload;
  const body=canonical_(p);
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
    } else if (JSON.stringify(sheet.getRange(1,1,1,IAT_HEADERS.length).getValues()[0])!==JSON.stringify(IAT_HEADERS)) {
      return output_({saved:false,error:"headers_changed"});
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
    const row=IAT_FIELDS.map(k => cell_(p[k]))
      .concat(IAT_SDO_KEYS.map(k => p.sdo_responses[k]),IAT_MFQ_KEYS.map(k => p.mfq_responses[k]),
        IAT_DOMAINS.map(k => p.mfq_domain_scores[k]),[new Date().toISOString(),hash,body]);
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
