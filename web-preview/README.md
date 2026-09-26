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

Desktop users can respond with **E** (left) and **I** (right). Touch devices display large left and right response buttons. At the end, the calculated participant results are saved to the Supabase `public.participants` table with the session's anonymous participant ID. A failed request is shown to the participant and can be retried; trial-level data and calculated scores can still be downloaded as JSON.

The static app authenticates requests with the configured Supabase publishable key. Supabase Row Level Security must allow anonymous `INSERT` access to `public.participants`; no secret or service-role key belongs in this browser application.

## GitHub Pages

The repository's GitHub Actions workflow publishes this preview and its image assets as a static GitHub Pages site. After Pages is enabled with **GitHub Actions** as its source, use:

- <https://fatemeh1378-24.github.io/my-first-codex-project/web-preview/?group=1> — compatible pairing first
- <https://fatemeh1378-24.github.io/my-first-codex-project/web-preview/?group=2> — incompatible pairing first

Deployment and GitHub setup instructions are in the [repository README](../README.md#enable-github-pages).

## Customize later

Edit the `CONFIG` object at the top of `app.js` to change category labels, word lists, image paths, and timing. Participant-facing copy is kept in `index.html` and the instruction-building functions in `app.js`; layout and future RTL styles belong in `styles.css`.

## Preview limitation

This is a practical browser reproduction for review and customization. Browser timing and the scoring implementation should be independently validated before collecting research data.
