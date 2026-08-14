# MyBilling

MyBilling is a mobile-first bill payment tracking app built with React, Vite, and Convex.

## Features

- Single secure sign-in for owners and employees
- Owner registration and first-outlet onboarding
- Outlet-aware dashboards and role-based navigation
- Bill creation and editing for owners and employees
- Owner-only bill history, filters, payments, receipts, distributors, bank accounts, outlets, and employees
- Atomic payment recording in Convex
- Shareable payment receipt image export

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start Convex in local mode:

   ```bash
   CONVEX_AGENT_MODE=anonymous npx convex dev
   ```

   This creates `.env.local` with `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`.

3. Generate Convex Auth keys and set required backend env vars:

   ```bash
   node -e 'import("jose").then(async({generateKeyPair,exportPKCS8,exportJWK})=>{const k=await generateKeyPair("RS256",{extractable:true});const priv=await exportPKCS8(k.privateKey);const pub=await exportJWK(k.publicKey);process.stdout.write(JSON.stringify({JWT_PRIVATE_KEY:priv.trimEnd().replace(/\n/g," "),JWKS:JSON.stringify({keys:[{use:"sig",...pub}]})}))})' > .auth-keys.json
   JWT=$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(".auth-keys.json","utf8"));process.stdout.write(d.JWT_PRIVATE_KEY)')
   JWKS=$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(".auth-keys.json","utf8"));process.stdout.write(d.JWKS)')
   npx convex env set "JWT_PRIVATE_KEY=$JWT"
   npx convex env set "JWKS=$JWKS"
   npx convex env set "SITE_URL=http://localhost:5173"
   rm .auth-keys.json
   ```

4. In another terminal, start the frontend:

   ```bash
   npm run dev
   ```

5. Open the Vite URL, usually `http://localhost:5173`.

## Convex Deployment

1. Log in and link the project:

   ```bash
   npx convex login
   npx convex init
   ```

2. Generate auth keys and set required Convex env vars:

   ```bash
   node -e 'import("jose").then(async({generateKeyPair,exportPKCS8,exportJWK})=>{const k=await generateKeyPair("RS256",{extractable:true});const priv=await exportPKCS8(k.privateKey);const pub=await exportJWK(k.publicKey);process.stdout.write(JSON.stringify({JWT_PRIVATE_KEY:priv.trimEnd().replace(/\n/g," "),JWKS:JSON.stringify({keys:[{use:"sig",...pub}]})}))})' > .auth-keys.json
   JWT=$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(".auth-keys.json","utf8"));process.stdout.write(d.JWT_PRIVATE_KEY)')
   JWKS=$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(".auth-keys.json","utf8"));process.stdout.write(d.JWKS)')
   npx convex env set "JWT_PRIVATE_KEY=$JWT"
   npx convex env set "JWKS=$JWKS"
   rm .auth-keys.json
   ```

3. Set your frontend site URL in Convex:

   ```bash
   npx convex env set SITE_URL https://your-netlify-site.netlify.app
   ```

4. Deploy Convex:

   ```bash
   npx convex deploy
   ```

5. After deploy, copy the production Convex URL from the deployment output or dashboard.

## Netlify Deployment

1. In Netlify, connect this repository.
2. Use these settings:
   Build command: `npm run build`
   Publish directory: `dist`
3. Add an environment variable:
   `VITE_CONVEX_URL=<your production convex url>`
4. Deploy the site.

If your final Netlify URL changes, update Convex:

```bash
npx convex env set SITE_URL https://your-final-site.netlify.app
npx convex deploy
```

## Verification

- `CONVEX_AGENT_MODE=anonymous npx convex dev --once`
- `npx tsc --noEmit`
- `npm run build`
