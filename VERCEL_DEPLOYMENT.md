# Vercel deployment

This repository is configured to deploy from the repository root as a pnpm
workspace. The Vercel project should use the default root directory (`.`).

## Required environment variables

Add this variable in the Vercel project settings for Preview and Production:

- `SESSION_SECRET` — a long, random value used to sign the staff session cookie

The `/manage` staff screen uses the built-in password `adminhillview`.

The public mixology flow does not require a database or any other environment
variables.

## Build settings

`vercel.json` already supplies:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @workspace/hillview-hookah-mixology run build`
- Output directory: `artifacts/hillview-hookah-mixology/dist/public`

The `/api/manage/*` endpoints are included as Vercel serverless functions and
the remaining routes fall back to the Vite SPA entry point.