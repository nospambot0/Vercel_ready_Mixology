# Vercel deployment

This repository is configured to deploy from the repository root as a pnpm
workspace. The Vercel project should use the default root directory (`.`).

## Required environment variables

Add this variable in the Vercel project settings for Preview and Production:

- `SESSION_SECRET` — a long, random value used to sign the staff session cookie

The `/manage` staff screen uses the built-in password `adminhillview`.

The public mixology flow does not require a database or any other environment
variables.

For AI-powered DJ announcements, also add:

- `BHARATVOICEAI_URL` — public base URL of your deployed BharatVoiceAI service (for example, `https://voice.example.com`)
- `BHARATVOICEAI_API_KEY` — the BharatVoiceAI API key configured in `STATIC_API_KEYS`

Mixology calls BharatVoiceAI server-side through `/api/dj/tts`; the API key is never exposed to staff-device browsers. BharatVoiceAI's TTS API accepts text, language, voice and speed and can stream MP3 audio. The repository's English TTS path currently falls back to gTTS, while Indic languages can use the Indic Parler-TTS backend.

## Build settings

`vercel.json` already supplies:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @workspace/hillview-hookah-mixology run build`
- Output directory: `artifacts/hillview-hookah-mixology/dist/public`

The `/api/manage/*` endpoints are included as Vercel serverless functions and
the remaining routes fall back to the Vite SPA entry point.