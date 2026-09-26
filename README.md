# Multimedia Explorer

An open-source example app from [OpenRouter](https://openrouter.ai) that shows how to build a multi-model media generation tool where you can use text, image, and video models together. Try out a hosted version of upstream at https://multimedia-explorer.openrouter.ai/

This fork runs in **BYOK mode**: visitors paste a temporary OpenRouter API key instead of signing in, so the deployment itself holds no credentials. Hand someone a key with a spending limit and a URL, and that key is the whole authorization and spending boundary. See [Bring your own key](#bring-your-own-key-byok).

## What it does

**Image and video generation** from a unified prompt interface. Pick a model, type a prompt, and get results — images return instantly, videos run as async jobs with status polling.

**Dynamic model discovery.** The app calls `client.models.list()` with `output_modalities=image|video|text` to fetch available models at runtime. Nothing is hardcoded — when OpenRouter adds a new model, it shows up automatically. Video model configs (supported durations, resolutions, audio) come from the `/api/v1/videos/models` endpoint.

**Brand moodboards.** Paste a website URL or describe a mood, and the app uses a text model to extract a brand identity — colors, personality traits, visual style, tone — that gets injected into every subsequent generation as system context.

**Reference images.** Upload or paste image URLs to send as multimodal input alongside your text prompt.

**Generation history.** A visual timeline stores your last 50 generations with hover previews. Click any entry to restore the full context — prompt, model, references, settings — so you can iterate on past work.

## How it uses the OpenRouter API

The entire app runs through the [`@openrouter/sdk`](https://www.npmjs.com/package/@openrouter/sdk):

```typescript
import OpenRouter from "@openrouter/sdk";

const client = new OpenRouter({ apiKey });
```

### Model discovery

```
GET /api/v1/models?output_modalities=image   → image models
GET /api/v1/models?output_modalities=video   → video models
GET /api/v1/models?output_modalities=text    → text models (for moodboard analysis)
GET /api/v1/videos/models                    → video model capabilities (durations, resolutions, audio)
```

### Image generation

A single `POST` to the chat completions endpoint with multipart messages — text prompt, optional base64 reference images, and optional brand context as a system message.

### Video generation

Video is async and job-based:

1. **Submit** — `POST /api/v1/videos/generations` with prompt, model, duration, resolution, and aspect ratio. Returns a job ID.
2. **Poll** — `GET /api/v1/videos/generations/{jobId}` every 5 seconds until status is `completed` or terminal (`failed`, `cancelled`, `expired`).
3. **Download** — `GET /api/v1/videos/generations/{jobId}/content` returns the MP4.

### Authentication

Two paths, both resolving to a plain OpenRouter API key held in browser memory:

1. **BYOK access key** (default) — the visitor pastes a key they were given. It is verified with `GET /api/v1/key` and kept in `sessionStorage` for that tab only.
2. **OpenRouter OAuth** (preserved from upstream, offered as a secondary link) — see [`sign-in-with-openrouter`](https://github.com/OpenRouterTeam/sign-in-with-openrouter) for the flow.

Whichever path is used, the browser sends the key to this app's own API routes in an internal `X-OpenRouter-Key` header, and each route uses it for that one upstream request.

### Key metadata

`GET /api/v1/key` (`apiKeys.getCurrentKeyMetadata()` in the SDK) reports the key's spending limit and usage. It is used both to validate a pasted key and to show a `Demo budget $7.84 / $10.00 remaining` indicator in the header.

## API routes

| Route | Purpose |
|---|---|
| `GET /api/models` | Fetch image, video, and text models + video model configs |
| `GET /api/key` | Validate the supplied key and read its spending limit / usage |
| `POST /api/generate` | Generate an image from prompt, references, and brand context |
| `POST /api/moodboard` | Analyze a URL or description to extract brand identity |
| `POST /api/improve-prompt` | Rewrite a prompt to be more detailed and effective |
| `POST /api/video/submit` | Submit an async video generation job |
| `GET /api/video/[jobId]` | Poll video job status |
| `GET /api/video/[jobId]/content` | Download completed video |

## Architecture

```
app/
├── api/
│   ├── models/          # Dynamic model discovery
│   ├── key/             # Key validation + spending limit
│   ├── generate/        # Image generation
│   ├── moodboard/       # Brand identity extraction
│   ├── improve-prompt/  # Prompt enhancement
│   └── video/           # Video submit, poll, download
├── page.tsx             # State management and layout
└── components/          # UI (form, moodboard, cards, timeline)
    ├── access-key-gate.tsx   # BYOK key entry screen
    └── auth-status.tsx       # Session indicator, budget, "Forget API key"

hooks/
├── use-models.ts             # Fetch and cache models
├── use-openrouter-auth.ts    # Resolves the active key (BYOK -> OAuth -> dev env)
├── use-key-budget.ts         # Remaining spend on the active key
└── use-video-generation.ts   # Video job state machine

lib/
├── openrouter.ts        # SDK client factory
├── api-auth.ts          # The key boundary: internal header in, Bearer out
├── byok-session.ts      # Session-scoped storage for the access key
├── openrouter-auth.ts   # OAuth 2.0 PKCE flow
├── history-db.ts        # IndexedDB for image/video storage
└── types.ts             # Shared types
```

All user data is client-side: metadata in `localStorage`, image blobs in `IndexedDB`, and the access key in `sessionStorage` only.

## Getting started

This project pins the Node.js 22 LTS line via `engines` in `package.json` and `.nvmrc`.
That is a deliberate choice for this repo, not a platform default — see
[Node.js version note](#nodejs-version-note).

```bash
bun install          # or: npm install
bun dev              # or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The access-key screen appears; paste an OpenRouter API key to use the app.

```bash
bun run build        # production build
bun start            # serve the production build
bun run lint         # eslint
```

Optionally, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_OPENROUTER_API_KEY` to skip the key screen while developing. That variable is **development only** — it is compiled out of production builds, so a deployed instance can never serve a shared key to its visitors.

### Node.js version note

On **Node.js >= 24.14.0**, an OpenRouter call that comes back `401` fails inside the Next.js
dev/production server with `Unable to make request: TypeError: fetch failed`
(cause: `expected non-null body source`) instead of surfacing the real error.

This is an upstream regression, not something this app does: Next's `patch-fetch` rebuilds any
`Request` passed to `fetch()` from its body stream, and undici's 401-retry path rejects a body
whose source is null. It is tracked as
[vercel/next.js#90826](https://github.com/vercel/next.js/issues/90826) and
[nodejs/undici#4940](https://github.com/nodejs/undici/issues/4940).

Scope, on an affected Node version:

- Only `401` responses are affected — successful generations and other errors (400, 402, …)
  work normally. It is a confusing error message for a rejected key, not a broken pipeline.
- Only the SDK-backed routes are affected (`/api/generate`, `/api/improve-prompt`,
  `/api/moodboard`, `/api/key`). The video routes use plain `fetch` and are unaffected.

Rather than work around it in application code, this project pins Node 22 so local
development and deployment both run on a version without the regression:

- `engines.node` is set to `22.x` in `package.json`
- `.nvmrc` selects the same line locally (`nvm use`)

Note that new Vercel projects currently default to Node 24.x, which falls in the affected
range — so the pin is what makes the deployment runtime deterministic here. Confirm the
project's Node version in **Project Settings → Build & Deployment → Node.js Version** if
your platform does not pick it up from `engines`.

## Bring your own key (BYOK)

The app ships with no OpenRouter credentials and needs none to run. Each visitor supplies their own key, which is also the spending boundary:

1. Create an OpenRouter API key with a spending limit (e.g. $10) at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).
2. Send that key and the deployment URL to whoever should use it.
3. They paste the key into the entry screen and use the app — no OpenRouter account required.
4. **Forget API key** in the header clears it; generated history stays.

How the key is handled:

- Stored in `sessionStorage` only — never `localStorage`, IndexedDB, cookies, URLs, or generation history.
- Survives a reload of the same tab and disappears when the browser session ends. A new tab asks for it again.
- Sent to this app's API routes in an `X-OpenRouter-Key` header, forwarded once as `Authorization: Bearer ...` to OpenRouter, and never persisted, cached, or logged server-side.
- Never printed to the console, and upstream error bodies from the key-metadata route are not echoed back to the browser.
- If a key is missing, invalid, or out of budget, requests fail with a plain error — there is no shared credential to fall back to.

Treat a key as a secret even with a spending limit: anyone who has it can spend the remaining balance until you revoke it.

## Deploying to Vercel

No production environment variables and no secrets are required.

```bash
gh repo fork OpenRouterTeam/multimedia-explorer   # or fork in the GitHub UI
vercel                                            # or import the repo at vercel.com/new
```

Vercel detects Next.js and needs no further configuration. Leave `NEXT_PUBLIC_OPENROUTER_API_KEY` **unset** in production — it is ignored there by design. No other environment variables are inherited from upstream.

Check that the project builds on **Node 22**, which `engines.node` requests; see the
[Node.js version note](#nodejs-version-note) for why this project pins it.

To rotate access, revoke the key in the OpenRouter dashboard; the deployment itself holds nothing to rotate.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router)
- [React](https://react.dev) 19
- [OpenRouter SDK](https://www.npmjs.com/package/@openrouter/sdk)
- [Tailwind CSS](https://tailwindcss.com) v4
- TypeScript 5

## License

MIT
