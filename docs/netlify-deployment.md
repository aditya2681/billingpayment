# Netlify deployment

The existing frontend is at `https://dk-payment.netlify.app/`. Its Git repository is `aditya2681/billingpayment`, and the production Convex deployment used by the published site is `https://woozy-partridge-410.eu-west-1.convex.cloud`. Netlify hosts the frontend; Convex hosts the backend and database.

## Netlify settings

In Netlify, open the existing project and check the following settings:

- Under **Project configuration → Build & deploy → Continuous deployment**, connect the GitHub repository and select `main` as the production branch. If already connected, leave the connection in place.
- Build command: `npm run build`; publish directory: `dist`. These are also specified in `netlify.toml`, along with the rewrite needed for React routes and page refreshes.
- Under **Project configuration → Environment variables**, set `VITE_CONVEX_URL` for the production build to the production Convex URL above. This frontend URL is public; never use a Convex deploy key, auth private key, or other secret as this value.

## Publish an update

1. Review changes with `git status` and `git diff`, then run `npm run lint`, `npm test`, and `npm run build`.
2. If the update includes Convex functions or schema changes, deploy and verify the backend separately against the correct production deployment before publishing the frontend. A frontend push does not deploy Convex functions or copy database records.
3. Commit and push the reviewed files:

   ```bash
   git add <files-to-publish>
   git commit -m "Describe the changes"
   git push origin main
   ```

4. In Netlify, open **Deploys** and check that the deploy for the new commit succeeds and is published. If automatic Git deploys are not enabled, connect the repository or trigger a production deploy from the Netlify dashboard.
5. Open the production site on a phone, sign in with an existing account, and check the correct outlet, bills, payments, reports, and a page refresh. Avoid creating test transactions in production.

Netlify uses its own environment variables when building; the local `.env.local` file is not uploaded to Netlify. The production Convex `SITE_URL` is already set to the existing Netlify site. Do not change production auth settings or import data as part of an ordinary frontend deployment.
