# Google Sheets storage for the existing IAT

This is a staged alternative to the inaccessible Supabase/Cloudflare paths.
The production IAT still uses Supabase until its adapter is explicitly changed.
The owner's anonymous, no-VPN tests have established readable responses for
simple form POSTs from GitHub to Apps Script; the complete payload must pass
the new acceptance check after deploying Code.gs.

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
4. Only after that check, integrate sheets-client.js with the IAT completion
   flow, recover pending completed submissions on reload, and require a matching
   receipt before displaying success. Do not use `no-cors` as proof of saving.
5. Run an actual full IAT and inspect its Results row. Keep regular private
   exports/backups and test restore. Neither a free service nor temporary browser
   storage guarantees permanent retention or continuous availability.

## Field preservation

`fields.json` lists the **33 fields sent by the existing browser payload**,
extracted directly from participantInsertPayload in app.js. Code.gs accepts
exactly those fields, preserves their names and values, and adds separate columns
for 16 SDO raw responses, 36 MFQ raw responses, six MFQ domains, receipt time,
digest and the original JSON. Total: 94 columns. Null uncomputable IAT scores
stay null in payload_json and appear blank in their spreadsheet cells. Scores
are not recomputed or changed by the backend. Formula-like strings are kept as
text with a zero-width prefix in individual cells and exactly in payload_json.

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

13 checks exercise actual backend/client code with mocked Sheets services,
including all fields, gender RT difference, final IAT score, 52 raw answers,
digest agreement, duplicate retries, conflicts, lost acknowledgements, quota
errors, header changes, private GET responses and local-storage failure. They
do not substitute for the live acceptance checks above.
