# GrabMaps Personality Map

React 18 + Vite + TypeScript frontend with Vercel Serverless Functions for Grab Maps, Google Places reviews, OpenAI personality/chat, and ElevenLabs TTS.

## Environment

Set these in Vercel Project Settings:

```bash
GRAB_MAPS_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
GOOGLE_MAPS_API_KEY=
```

No API keys are read by the browser. Browser calls stay on `/api/*`; map resources are proxied through `/api/map/proxy`.

## Commands

```bash
npm install
npm run assets
npm run build
```

Deploy with Vercel after the env vars are configured:

```bash
vercel deploy --prod
```

## Note on `grab-maps`

The public npm registry did not expose a `grab-maps` package during setup, so this repo vendors a minimal local package at `vendor/grab-maps` that exports `GrabMapsLib` and wraps MapLibre. It keeps the required import/class surface and routes Grab map resource loading through the BFF.
