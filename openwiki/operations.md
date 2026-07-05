# Operations

This repository is intentionally lightweight to operate:
- install dependencies
- run the Vite dev server
- build the app
- deploy the built static site to GitHub Pages

## Local development
From the repository root:

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The build script runs TypeScript checking and then builds the Vite app.

## Previewing the built app

```bash
npm run preview
```

## Verification scripts
- `/scripts/thanni-smoke.ts` is the main repo-level smoke test.
- It exercises core rule transitions, solo-call checks, scoring, and the AI abstraction.
- Run it with the TypeScript runner used by the repo, as noted in the script header.

## Deployment
- `/.github/workflows/deploy.yml` runs on pushes to `main` and manual dispatch.
- The workflow installs dependencies, runs the production build, and publishes `dist` to GitHub Pages.
- The published site URL is documented in `/README.md` and `/package.json`.

## What to watch out for
- There is no backend service to deploy; the repository ships a static frontend.
- If you change asset loading, confirm the Vite build still outputs a static bundle suitable for GitHub Pages.
- If you change rules or AI behavior, rerun the smoke script in addition to the build.
- If you touch the GitHub Pages workflow, remember that the repo is configured for static hosting, not a server process.

## Useful source references
- `/package.json`
- `/.github/workflows/deploy.yml`
- `/scripts/thanni-smoke.ts`
- `/README.md`
