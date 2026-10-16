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

Desktop users can respond with **E** (left) and **I** (right). Touch devices display large left and right response buttons. At the end, the calculated participant results are saved to the Supabase `public.participants` table with the session's anonymous participant ID. A failed request is shown to the participant and can be retried. Trial-level data remains available internally during the session for scoring, but is not downloadable from the participant-facing page.

The static app authenticates requests with the configured Supabase publishable key. Supabase Row Level Security must allow anonymous `INSERT` access to `public.participants`; no secret or service-role key belongs in this browser application.

Before deploying the demographic form, run [`../supabase/participants_demographics.sql`](../supabase/participants_demographics.sql) in the Supabase SQL editor. It adds the six demographic columns and replaces the age check with the inclusive 20–40 range without changing RLS. Re-run this migration for existing deployments before publishing the expanded age range; otherwise the database may reject participants aged 31–40. The file includes commented, optional cleanup statements for the obsolete nationality and ethnicity columns. Also run [`../supabase/add_iat_block_mean_rt_columns.sql`](../supabase/add_iat_block_mean_rt_columns.sql) manually to add the seven participant-level IAT block mean RT columns used by the submission payload.

## GitHub Pages

The repository's GitHub Actions workflow publishes this preview and its image assets as a static GitHub Pages site. After Pages is enabled with **GitHub Actions** as its source, use:

- <https://fatemeh1378-24.github.io/my-first-codex-project/web-preview/?group=1> — compatible pairing first
- <https://fatemeh1378-24.github.io/my-first-codex-project/web-preview/?group=2> — incompatible pairing first

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
