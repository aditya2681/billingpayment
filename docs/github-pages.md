# GitHub Pages deployment

The GitHub Pages site is published from the `main` branch of `aditya2681/billingpayment` at `https://aditya2681.github.io/billingpayment/`. It uses the existing production Convex backend and database; GitHub Pages hosts only the frontend. It does not copy data or deploy Convex functions.

## One-time setup

1. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, create a repository variable named `VITE_CONVEX_URL` with the production Convex deployment's `.convex.cloud` URL (currently `https://woozy-partridge-410.eu-west-1.convex.cloud`). Verify the deployment in the Convex dashboard before changing this value. This URL is public frontend configuration, not an admin key; never put Convex deploy keys or auth private keys in it.
3. Push the workflow in `.github/workflows/pages.yml` to `main` or run **Actions → Deploy GitHub Pages → Run workflow**. The workflow installs dependencies, runs lint and tests, builds, and publishes `dist`.
4. Open the Pages URL on a phone. Sign in with an existing production account, check the correct outlet and bills, and test reports and a page refresh. Do not create test transactions in the production database.

GitHub Pages is a static host and does not support server-side route fallbacks. The Pages build uses hash URLs to support refresh and direct links; local development and Netlify keep their existing routes. The manifest and service worker are scoped to the repository path.

## Publishing later changes

1. Review the changes with `git status` and `git diff`. Run `npm run lint`, `npm test`, and `npm run build` locally.
2. If Convex code changed, deploy and verify the backend separately against the correct production deployment before publishing a frontend that depends on it. Do not import or overwrite production data as part of an ordinary code deployment.
3. Commit and push the reviewed changes:

   ```bash
   git add <files-to-publish>
   git commit -m "Describe the changes"
   git push origin main
   ```

4. Open the repository's **Actions** tab and verify the **Deploy GitHub Pages** run completes. If it fails, inspect the failed step. The previously published version remains available until a successful deployment.

The current Convex `SITE_URL` is configured for the existing Netlify site. Username/password sign-in does not redirect through that setting, but email/OAuth flows or other redirect-based auth features would require reviewing their allowed URLs and `SITE_URL` before use. Changing it could affect the existing site.
