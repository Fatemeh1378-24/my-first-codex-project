# Race IAT web preview

This directory contains a dependency-free browser preview based on the repository's original Inquisit task. The original `.iqjs`, `.htm`, and image files remain unchanged.

## Run locally

From the repository root, start a static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/web-preview/>.

The preview randomly assigns one of the two block orders. For repeatable testing, use:

- <http://localhost:8000/web-preview/?group=1> — compatible pairing first
- <http://localhost:8000/web-preview/?group=2> — incompatible pairing first

Desktop users can respond with **E** (left) and **I** (right). Touch devices display large left and right response buttons. Completed participant results are now sent through `sheets-client.js` to the owner's Apps Script web app and stored in the private **IAT Results → Results** sheet. All 33 fields in the previous Supabase payload are preserved, including final D-score, all seven block means, face-gender RT means and their difference, demographic data, SDO/MFQ raw responses and scores. The sheet also expands questionnaire item answers into individual columns. Trial-level records remain in session memory for scoring and are not submitted or downloaded.

A matching UUID and SHA-256 receipt is required before showing thanks. Completed unsent submissions are temporarily kept in browser localStorage and can be retried after reload; incomplete tests are not recovered. An exact retry cannot create another row, and different data under the same UUID cannot overwrite the first submission. Closing private windows or clearing browser data can remove the temporary copy. See [Sheets backend setup and limits](../sheets-backend/README.md).

The browser no longer needs a direct Supabase connection or a database key. Existing Supabase data and SQL migrations are retained for reference; the new path does not write to that table. The owner's Apps Script deployment must execute as its owner and allow anonymous submissions while the spreadsheet stays private. Run a full test without VPN and inspect its Results row before distributing the study.

## GitHub Pages

The repository's GitHub Actions workflow publishes this preview and its image assets as a static GitHub Pages site. After Pages is enabled with **GitHub Actions** as its source, use:

- <https://fatemeh1378-24.github.io/my-first-codex-project/?group=1> — compatible pairing first
- <https://fatemeh1378-24.github.io/my-first-codex-project/?group=2> — incompatible pairing first

Deployment and GitHub setup instructions are in the [repository README](../README.md#enable-github-pages).

## Customize later

Edit the `CONFIG` object at the top of `app.js` to change category labels, word lists, image paths, and timing. Participant-facing copy is kept in `index.html` and the instruction-building functions in `app.js`; layout and future RTL styles belong in `styles.css`.

## Uploaded face stimuli

The twelve `Iranian_F1`–`Iranian_M3` and `Afghan_F1`–`Afghan_M3` JPG files
are the participant-provided originals, copied identically into the repository
root and this preview directory. Numbering follows the order supplied in chat,
which differs from some of the names inside the uploaded ZIP.

Before starting any timed trials, the browser center-crops each face to 4:5,
resamples it to 160 × 200 pixels with high-quality smoothing, and decodes a JPEG
using the same quality setting (0.90). It retains these prepared images in memory
for reuse throughout the task. The display is capped at 160 × 200 CSS pixels and
shrinks proportionally on small screens. Source files remain unchanged; this
preparation applies to the web preview, not the native Inquisit runtime. Common
dimensions and compression do not guarantee identical perceptual sharpness or
restore detail absent from an uploaded original. No facial features, skin tones,
or expressions are synthesized or retouched.

The preview applies a fixed unsharp mask per image before JPEG encoding, using
sigma 0.8 pixels and the blend strengths in `FACE_SHARPENING`. This strengthens
local edges in the less detailed images towards `Iranian_M3.jpg`, the reference
with the highest contrast-normalized edge-detail score at the final display
size. The reference itself receives no sharpening. It replaces the previous
softening operation; processing always starts from the uploaded original.
Convolution clamps at image boundaries and uses canvas pixel arithmetic rather
than the browser-dependent canvas filter API. No generative restoration is used.

Calibration measures the square root of summed squared four-neighbor Laplacian
responses divided by summed squared central-difference gradient responses,
within x=25..134 and y=35..169 of the decoded 160 × 200 JPEG. In the calibration
browser the score range changed from 1.317–1.727 to 1.727–1.732. This is a
contrast-normalized image-detail measure, not a validated measure of equal
perceived sharpness. Sharpening can emphasize existing noise and compression
artifacts; it cannot recover details absent from the uploaded original.
Calibration is specific to the current twelve originals: replacing them requires
reviewing the strengths. No global brightness or contrast normalization is used.

The existing block counts (20/20/20/40/20/20/40), two counterbalanced orders,
attribute-first alternation in combined blocks, and category-specific shuffled
item pools are retained. These follow the structure declared in the bundled
`pictureiat_inc.iqjs`; no fixed ordering by gender is added. This is not a
claim of identical random sequences or timing between JavaScript and Inquisit.

## Preview limitation

This is a practical browser reproduction for review and customization. Browser timing and the scoring implementation should be independently validated before collecting research data.
