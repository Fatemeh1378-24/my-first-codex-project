# Google Sheets storage for the existing IAT

This is a staged alternative to the inaccessible Supabase/Cloudflare paths.
The production IAT now uses sheets-client.js and the private Results sheet. Supabase data is retained, but new submissions are not written there.
The owner's anonymous, no-VPN tests have established readable responses for
simple form POSTs from GitHub to Apps Script; the complete 33-field synthetic payload and duplicate receipt were then confirmed live without VPN, with a single matching row in StorageChecks. A full actual IAT acceptance check is still required before participant distribution.

## Setup

1. Open `web-preview/setup-storage.html` on GitHub Pages and copy the complete
   script. Replace the existing Apps Script Code.gs, save, then update the
   existing deployment using Manage deployments → edit → New version → Deploy.
   Keep Execute as Me and access Anyone. Never make the spreadsheet public.
2. Open `storage-check-complete.html` from the same GitHub Pages origin without
   VPN, ideally in a private browser window and on mobile data as well as Wi-Fi.
   It sends a complete synthetic record twice using the same UUID. Both receipts
   must match the payload's SHA-256 and the second must indicate a duplicate.
3. In the private spreadsheet, inspect StorageChecks. There must be exactly one
   row for the displayed UUID. Check all 33 original fields, the 52 raw item
   answers, and the six MFQ domain scores. The synthetic D-score is 0.4; mean
   female RT is 520, mean male RT 590, and male-minus-female difference 70 ms.
4. The IAT completion flow uses sheets-client.js, recovers pending completed
   submissions on reload, and requires a matching receipt before displaying
   success. Do not use `no-cors` as proof of saving.
5. Run an actual full IAT and inspect its Results row. Keep regular private
   exports/backups and test restore. Neither a free service nor temporary browser
   storage guarantees permanent retention or continuous availability.

## Field preservation

`fields.json` lists the 36 fields sent by the browser: all 33 original fields
plus `iat_trials`, `iat_quality`, and `iat_interpretation`. The new backend also
accepts exact legacy 33-field payloads, including pending offline submissions,
without changing their JSON or digest. It appends three columns **after** the
original 94 columns, for 97 total. Existing values, header positions, JSON and
receipts stay intact; old rows have no new IAT details. Modified or unexpected
headers still fail closed. Questionnaires and existing score fields are retained.

All 180 raw IAT trials (including training and >10s trials) are stored as JSON in
`iat_trials` and included in `payload_json`; see `../SCORING.md` for the data
dictionary. Quality/exclusion reasons and Millisecond interpretation are stored
in their own JSON columns. Nonfinite scores are JSON nulls and have explicit
invalid/exclusion metadata. A request over 200,000 characters or canonical
payload over 49,000 characters is rejected without writing or truncation, keeping
below the Sheets 50,000-character cell limit.

### Upgrade order (required before publishing the new browser)

1. Replace Apps Script `Code.gs` with this directory's tested `Code.gs` and
   update the existing deployment (Manage deployments → edit → New version →
   Deploy), keeping its current URL, Execute as Me, and access Anyone.
   `web-preview/setup-storage.html` contains the exact same copyable code; use
   the **new branch's version** before the website deployment, not the old live
   setup page. The Sheet remains private.
2. GET the existing endpoint and confirm `iat_details_version: 1` and the three
   new field names. Do not publish the new browser against the old backend:
   the old exact-schema validator rejects the new payload.
3. Publish the browser only after this capability is confirmed. Run the complete
   storage probe and a full synthetic IAT, then inspect all three new columns
   in the owner's private sheet. Keep synthetic data out of participant Results
   by using the dedicated `probe` kind / StorageChecks tab.
4. Header extension is automatic on the first write under ScriptLock; no manual
   column insertion, deletion or rewriting of previous participant data is needed.
   Historical raw IAT trials were never stored and cannot be backfilled.

The live Supabase table schema has **not** been independently inspected. Before
calling the migration complete, reconcile its actual columns against this list.
For the project owner, this read-only SQL lists columns without fetching anyone's
results:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'participants'
order by ordinal_position;
```

## Reliability and privacy

- ScriptLock serializes duplicate checks and writes for this script. Reusing a
  UUID with the same exact data returns the prior receipt; different data under
  an existing UUID is rejected and never overwrites a prior row. Separate IAT
  sessions with new UUIDs are separate participants, not person-level dedup.
- A successful write is flushed and read back before a receipt is generated.
  Errors, quota failures, modified headers and corrupt duplicates fail closed.
- Probe records go to StorageChecks and real submissions to Results. Prior
  ConnectionTest and BrowserTest tabs are not deleted or modified.
- GET returns field names and version only. No endpoint exposes stored results.
  Apps Script executes as its owner under the Sheets permission already reviewed
  in setup. Anonymous POST is intentionally public and is not an anti-bot system.
  The spreadsheet itself remains private.
- Pending submissions in sheets-client.js survive reload only when browser
  localStorage is available. Clearing data or private-window closure can remove
  that temporary copy. Do not collect on shared devices without handling that
  temporary data appropriately.
- Apps Script/Sheets have account quotas and simultaneous execution limits.
  Availability from a particular network and sustained capacity must be tested;
  a successful connectivity check is not a long-term availability guarantee.

## Local checks

From repository root:

```sh
node sheets-backend/client.test.mjs
```

The client checks exercise actual backend/client code with mocked Sheets services,
including all fields, gender RT difference, final IAT score, 52 raw answers,
digest agreement, duplicate retries, conflicts, lost acknowledgements, quota
errors, header changes, private GET responses and local-storage failure. The additional application tests cover MFQ completion and reload recovery. They
do not substitute for the live acceptance checks above.

Additional output regression checks:

```sh
node web-preview/verify-preview.mjs
node web-preview/iat-output.test.mjs
```

These exercise raw-trial roundtrips and independent rescoring, unchanged valid D
in both orders, interpretation boundaries, invalid-data exclusion, retained
10,000 ms trials, legacy header upgrades and retry receipts, and embedded backend
code parity. The full Chromium smoke test uses a mocked acknowledgement and
never submits synthetic participants to the live Results sheet.
