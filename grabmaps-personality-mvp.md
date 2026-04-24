# Plan — GrabMaps Personality Map (Hackathon MVP)

**Team:** 3 people · **Time:** 5 hours · **Region:** Singapore · **Deploy:** Vercel

## 1. Task Type
- [x] **Fullstack** — React+Vite frontend + Vercel Serverless BFF

## 2. Core Product (one sentence)
*"Search Singapore on a map; tap any place and a character (Italian chef, angry sergeant, cheerful mall guard…) appears with a pre-made image, speaks a review-flavored monologue in an ElevenLabs voice, and will chat with you."*

---

## 3. Architecture — Monolith BFF

```
┌──────────────────────── Browser (React + Vite + TS) ─────────────────────┐
│                                                                          │
│   GrabMapsLib widget ──► map, search, markers, routing                   │
│           │                                                              │
│           ▼ onPoiTap(placeId)                                            │
│   PersonalityCard ──► static image + monologue text + ▶ voice + chat     │
│                                                                          │
│   Zustand store (in-browser personality cache)                           │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ HTTPS — no third-party keys leave the BFF
                       ▼
┌──────────────── Vercel Serverless BFF (Node 20, TS) ─────────────────────┐
│                                                                          │
│   /api/map/style          ──► Grab style.json (Bearer)                   │
│   /api/poi/search         ──► Grab POI search                            │
│   /api/poi/nearby         ──► Grab Nearby v2                             │
│   /api/poi/details        ──► Grab Place Details                         │
│   /api/route              ──► Grab Direction                             │
│   /api/reviews            ──► Google Places (Text Search → Place Details)│
│   /api/personality/[id]   ──► ORCHESTRATOR                               │
│   /api/voice/tts          ──► ElevenLabs TTS                             │
│   /api/chat               ──► OpenAI gpt-4o-mini (conversation)          │
│                                                                          │
│   lib/                                                                   │
│   ├─ cache.ts            in-memory Map<placeId, Personality>             │
│   ├─ archetypes.ts       classifier + system prompts                     │
│   ├─ voiceRegistry.json  archetype → [ElevenLabs voiceId, …]             │
│   └─ withTimeout.ts      AbortController wrapper, fail-fast              │
│                                                                          │
│   public/assets/images/  8 static archetype .webp (pre-made by team)     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key design rule — no fallbacks.** Every external call is wrapped in a strict timeout (e.g. 8s LLM, 12s TTS, 5s reviews). On timeout/error: return `{ error }` to the frontend and show a fail state on the card. No retries, no degraded modes. Keeps the code trivially simple.

---

## 4. Tech Stack (locked)

| Layer | Choice |
|---|---|
| Frontend | **React 18 + Vite + TypeScript** |
| Map | **`grab-maps` npm (`GrabMapsLib`)** |
| Styling | **Tailwind CSS** |
| State | **Zustand** |
| BFF | **Vercel Serverless Functions (Node 20, TS)** |
| LLM | **OpenAI `gpt-4o-mini`** |
| Reviews | **Google Places API (Text Search + Place Details)** |
| Voice | **ElevenLabs TTS** (voice IDs registered per archetype) |
| Images | **Pre-made static files in `/public/assets/images/`** (team generates with Nano Banana *before* the hackathon code-push) |
| Cache | **In-memory Map** on BFF |
| Deploy | **Vercel** |

---

## 5. Frontend file layout

```
src/
├── main.tsx · App.tsx
├── components/
│   ├── GrabMap.tsx              wraps GrabMapsLib, emits onPoiTap
│   ├── PersonalityCard.tsx      image + text + voice btn + chat input
│   ├── ChatThread.tsx
│   └── RouteBanner.tsx
├── hooks/
│   ├── usePersonality.ts        GET /api/personality/:id
│   ├── useTts.ts                POST /api/voice/tts → Blob → <audio>
│   └── useChat.ts
├── store/
│   └── mapStore.ts              selectedPoi, personalityCache, userLoc
├── services/                     thin fetch wrappers (one per BFF route)
└── lib/config.ts
```

## 6. BFF file layout

```
api/
├── map/style.ts
├── poi/
│   ├── search.ts · nearby.ts · details.ts
├── route.ts
├── reviews.ts                    // Google Places (NEW)
├── personality/[id].ts           // orchestrator
├── voice/tts.ts                  // ElevenLabs
└── chat.ts                       // OpenAI
lib/
├── grabClient.ts                 fetch + Bearer header
├── googlePlacesClient.ts         Text Search → Details
├── openaiClient.ts · elevenClient.ts
├── cache.ts                      global Map
├── archetypes.ts                 classify() + systemPrompt()
├── voiceRegistry.json            archetype → voiceId[]
├── pickVoice.ts                  rating-aware + RNG selection
└── withTimeout.ts                wraps fetch in AbortController
public/
└── assets/
    └── images/
        ├── italian-chef-happy.webp
        ├── italian-chef-angry.webp
        ├── japanese-chef-happy.webp
        ├── japanese-chef-angry.webp
        ├── mall-guard.webp
        ├── angry-sergeant.webp
        ├── stern-teacher.webp
        ├── airport-staff.webp
        ├── hotel-concierge.webp
        └── local-neutral.webp
```

---

## 7. The Personality Pipeline (simplified, no fallbacks)

```
GET /api/personality/:grabPlaceId
    │
    ├─► cache.get(id) ──► hit? return
    │
    ├─► PARALLEL:
    │     a) Grab Place Details  (name, category, coords, rating)
    │     b) Google Places       (name + coords) → place_id → reviews[]
    │
    │     ↳ either times out → respond { error: "timeout" }
    │
    ├─► OpenAI (one structured-output call):
    │     input  = { name, category, rating, reviews }
    │     output = { archetype ∈ enum, displayName, monologue }
    │     timeout 10s → fail
    │
    ├─► voiceId  = pickVoice(archetype)                  // RNG within archetype
    │
    ├─► imageUrl = `/assets/images/${archetype}.webp`    // static path
    │
    └─► cache.set(id, { archetype, displayName, monologue, imageUrl, voiceId })
        return to frontend
```

Frontend then fires `POST /api/voice/tts { text, voiceId }` → streams back audio. Timeout 12s.

### Voice registry (example shape)

```json
// lib/voiceRegistry.json
{
  "italian-chef-happy":   ["voiceIdA", "voiceIdB", "voiceIdC"],
  "italian-chef-angry":   ["voiceIdD", "voiceIdE"],
  "japanese-chef-happy":  ["voiceIdF"],
  "japanese-chef-angry":  ["voiceIdG"],
  "mall-guard":           ["voiceIdH", "voiceIdI"],
  "angry-sergeant":       ["voiceIdJ"],
  "stern-teacher":        ["voiceIdK", "voiceIdL"],
  "airport-staff":        ["voiceIdM"],
  "hotel-concierge":      ["voiceIdN", "voiceIdO"],
  "local-neutral":        ["voiceIdP", "voiceIdQ", "voiceIdR"]
}
```

### `pickVoice(archetype, rating)` logic

```ts
function pickVoice(archetype: string, rating: number): string {
  const voices = registry[archetype] ?? registry["local-neutral"];
  // If the archetype has variants (e.g. -happy / -angry), the
  // classifier already picked the sentiment; here we just RNG within.
  return voices[Math.floor(Math.random() * voices.length)];
}
```

*(Rating already drove the archetype's sentiment suffix via `classify()`; `pickVoice` is pure RNG within that subset. Keeps logic orthogonal.)*

### Archetype model — LLM-driven classification
The LLM picks the archetype in the SAME call that writes the monologue, using **structured outputs (JSON schema with enum)** so the returned `archetype` is guaranteed to be one of the 10 known keys.

```ts
// lib/archetypes.ts
export const ARCHETYPE_KEYS = [
  'italian-chef-happy', 'italian-chef-angry',
  'japanese-chef-happy', 'japanese-chef-angry',
  'mall-guard', 'angry-sergeant',
  'stern-teacher', 'airport-staff',
  'hotel-concierge', 'local-neutral',
] as const;

export const personalityJsonSchema = {
  name: 'personality',
  schema: {
    type: 'object',
    properties: {
      archetype:   { type: 'string', enum: ARCHETYPE_KEYS },
      displayName: { type: 'string' },
      monologue:   { type: 'string' },
    },
    required: ['archetype', 'displayName', 'monologue'],
    additionalProperties: false,
  },
  strict: true,
} as const;
```

**Why LLM over hand-rolled rules:**
- Grab category strings are messy ("restaurant" / "eatery" / brand names) — hand-mapping is brittle.
- LLM understands cuisine from name ("Ciao Bella" → italian) and sentiment from reviews (richer than rating alone).
- One call produces both archetype + monologue → no extra round trip.

**Tradeoff accepted:** if the model goes off-format the request fails (no retry). With `strict: true` + enum, this is extremely rare.

### System prompt (picks archetype AND writes monologue in one call)

```
You are a casting director + character writer.

Given a Singapore place, choose the archetype that best fits,
then WRITE that character's monologue.

Archetype choices (pick exactly ONE):
- italian-chef-happy / italian-chef-angry    — Italian restaurants
- japanese-chef-happy / japanese-chef-angry  — Japanese restaurants
- mall-guard                                 — shopping malls, plazas
- angry-sergeant                             — military, army camps
- stern-teacher                              — schools, tuition centers
- airport-staff                              — airports, terminals
- hotel-concierge                            — hotels, resorts
- local-neutral                              — anything else

Sentiment suffix (-happy vs -angry), where the archetype supports it:
- rating ≥ 4.2 or overwhelmingly positive reviews → happy
- rating ≤ 3.0 or overwhelmingly negative reviews → angry
- otherwise use the review sentiment you read

Monologue rules:
- Speak IN CHARACTER as if you work at {placeName}.
- 80–120 words.
- Quote or paraphrase at least ONE review below.
- End with ONE question inviting the user to chat.

Return JSON matching the provided schema. Nothing else.

Place: {name}
Category: {category}
Rating: {rating}
Reviews (Google Maps, most recent first):
- "{review1.text}" — {review1.rating}★
- "{review2.text}" — {review2.rating}★
- "{review3.text}" — {review3.rating}★
```

---

## 8. 5-Hour Schedule (3 people, parallel tracks)

| Hour | A (Frontend lead) | B (BFF lead) | C (AI / assets / integration) |
|---|---|---|---|
| **0:00-0:30** Bootstrap | `npm create vite`, Tailwind, Zustand, repo, Vercel link | Scaffold `api/` dir; wire `/api/map/style` + `/api/poi/search`; curl-test | Finalize 10 archetype images into `/public/assets/images/`; seed `voiceRegistry.json` with known ElevenLabs IDs |
| **0:30-1:30** Map + details | Mount `GrabMapsLib`, SG center, built-in search; emit POI tap | `/api/poi/details`, `/api/poi/nearby`, `/api/route` — all proxies with `withTimeout` | Write `lib/archetypes.ts` (classify + system prompts); draft pickVoice |
| **1:30-2:30** Personality | `PersonalityCard` UI; on tap → `/api/personality/:id` → render | `/api/personality/[id].ts` orchestrator (parallel Grab + Google); in-memory cache | `/api/reviews.ts` (Google Text Search → Place Details); unit-test with Marina Bay Sands |
| **2:30-3:30** Voice + chat | Fire TTS on card open; `<audio>` playback; chat thread UI | `/api/voice/tts` (POST → stream back MP3); `/api/chat` with POI context | Validate 3 archetypes end-to-end (Italian chef, sergeant, hotel concierge) |
| **3:30-4:15** Route + polish | Route drawing on "Directions" click; loading/error states on card | Warm cache with 10 demo POIs in a startup script | Tune 3 monologues by hand; adjust classifier edge cases |
| **4:15-4:45** Deploy + QA | Deploy to Vercel, check all env vars | Watch BFF logs, fix latency issues | Run through full demo script on deployed URL |
| **4:45-5:00** Rehearse | Demo 3 times, freeze code | Be ready to hot-fix | Prep backup screenshots in case of live-demo network issues |

### 60-second demo script
1. Open app → SG map, built-in search.
2. Search "Marina Bay Sands" → tap marker.
3. Card slides in: happy hotel concierge, image + monologue quoting a 5★ review + voice speaking.
4. Tap a low-rated ramen shop → angry Japanese chef: *"'Soup tasted like dishwater'? I will FIGHT this critic!"*
5. User types in chat: "is the gyoza any better?" → chef replies in-character.
6. Click "Directions" → route draws from MBS to the ramen shop.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Google Places has no results for a POI | Ship demo only with verified POIs (spot-check in advance); `classify` still works without reviews and the LLM prompt degrades gracefully (reviews section optional) |
| Combined LLM call (classify + monologue) >10s | Fail-fast + card error state; team accepted this trade-off |
| LLM picks an off-enum archetype | `strict: true` + JSON schema enum prevents this at the API layer |
| ElevenLabs 10s+ TTS latency | Show "generating voice…" shimmer; user can read text while waiting |
| Cold Vercel function | Warm cache with 10 demo POIs right before demo |
| ElevenLabs voice IDs unavailable until later | Build with stub `voiceRegistry.json` (any default voice) → hot-swap when real IDs arrive |
| Grab ↔ Google place mismatch (same name, different entity) | Use lat/lng bias in Google Text Search; tolerate occasional wrong review (hackathon) |
| In-memory cache lost between lambda instances | Accept it; can bolt on Vercel KV in 5 min if needed |
| API key leaks | All secrets in Vercel env; BFF only; never log request bodies |

---

## 10. Environment variables

```
GRAB_MAPS_API_KEY=bm_...           # already in .env
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...             # pending
GOOGLE_MAPS_API_KEY=...             # NEW — for reviews
```

Browser sees only `/api/*` URLs — zero secrets in Vite bundle.

---

## 11. "Do not build this in 5 hours" list (explicit cuts)

- Live image generation (images are pre-made assets)
- Retry / fallback logic (fail-fast only)
- Streaming TTS (play full audio when ready)
- Auth / accounts / persistence
- Mobile responsive (desktop demo only)
- Multi-region (Singapore only)
- Automated tests (visual QA only)
- Custom origin pin (user GPS assumed for routing)

---

## 12. Decisions locked

1. **Classifier = LLM, no hand-rolled rules.** The same OpenAI call that writes the monologue also picks the archetype via JSON-schema structured output with a closed enum. See §7.
2. **Route origin = hardcoded `103.8198,1.3521`** (central Singapore, matches the SKILL.md `direction` snippet). Destination = tapped POI's `lng,lat`. `profile=driving`, `overview=full`. Call shape:
   ```ts
   const params = new URLSearchParams();
   params.append('coordinates', '103.8198,1.3521');       // origin (fixed)
   params.append('coordinates', `${poi.lng},${poi.lat}`); // dest
   params.set('profile', 'driving');
   params.set('overview', 'full');
   await fetch('https://maps.grab.com/api/v1/maps/eta/v1/direction?' + params, {
     headers: { Authorization: `Bearer ${process.env.GRAB_MAPS_API_KEY}` },
   });
   ```
3. **Chat = one-shot per message.** `/api/chat` receives `{ placeId, message }`, pulls the cached `{ archetype, displayName, monologue }` from the BFF cache to rebuild a compact system prompt, sends a single OpenAI call with only the latest user message, returns the reply. No history array, no chat transcript stored on the BFF. (Zustand keeps the visible thread on the client purely for rendering.)

---

## 13. SESSION_ID (multi-plan handoff)

- CODEX_SESSION: _n/a — codeagent-wrapper not installed_
- GEMINI_SESSION: _n/a_
