# Race IAT

This repository contains the original Inquisit task and a dependency-free browser preview in [`web-preview`](web-preview/).

## Published preview

After GitHub Pages is enabled, the preview is available at:

- Group 1: <https://fatemeh1378-24.github.io/my-first-codex-project/web-preview/?group=1>
- Group 2: <https://fatemeh1378-24.github.io/my-first-codex-project/web-preview/?group=2>

The URL without a `group` query parameter randomly assigns one of the two block orders.

## Enable GitHub Pages

1. Merge the deployment workflow into the repository's `main` branch.
2. On GitHub, open **Settings** → **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and select **Deploy Race IAT preview to GitHub Pages**. The workflow runs automatically after the merge; if needed, select **Run workflow** → **Run workflow**.
5. When the deployment finishes, use **Settings** → **Pages** → **Visit site**.

The workflow publishes the repository without moving files so the preview's existing relative image paths continue to resolve. The [`.nojekyll`](.nojekyll) marker ensures GitHub Pages serves the repository as a plain static site.
