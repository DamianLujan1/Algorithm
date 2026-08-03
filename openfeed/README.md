# Openfeed AI

A full-stack, passwordless curiosity companion that turns a personalized feed into fast,
source-grounded answers.

Openfeed is intentionally isolated from the existing algorithm directories. The original Scala
source remains untouched:

```text
timelineranker/server/src/main/scala/com/twitter/timelineranker/
uteg_liked_by_tweets/CombinedScoreAndTruncateTransform.scala
```

## What it does

- Creates an instant guest profile with a display name and 1–4 interests—no email or password.
- Gives consumers one primary action: ask a question and get a concise answer grounded in visible
  feed sources.
- Builds local relationship scores from those interests and explicit feed actions.
- Runs a compatibility adapter with the exact score, partition, sort, truncate, reply-injection,
  and random-append semantics of `CombinedScoreAndTruncateTransform`.
- Shows score breakdowns, input signals, exploration picks, and the source contract in the UI.
- Automatically learns lightweight topic preferences from questions, likes, saves, and hides.

The repository does not contain X's live Earlybird search index, UTEG graph, user data, or deployable
top-level build. Openfeed therefore uses labeled synthetic posts as compatible search candidates and
local guest preferences as compatible UTEG inputs. It does not claim to reproduce X's production
feed or its unavailable models.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite client proxies API requests to the Express server on port
`3001`.

The assistant works immediately in grounded synthesis mode. To use an OpenAI-compatible model,
configure the server only:

```bash
OPENAI_API_KEY=... OPENAI_MODEL=gpt-4.1-mini npm run dev
```

`OPENAI_BASE_URL` is optional. API credentials never reach the browser, model calls have a hard
timeout, and answers are constrained to the three sources selected by the unchanged ranker.

## Verify

```bash
npm run typecheck
npm test
npm run build
```

The ranking tests cover missing-score defaults, random-candidate reservation, Scala-compatible
negative `splitAt` behavior, truncation, and additional replies. API tests cover passwordless
sessions, grounded assistant retrieval, automated topic learning, cookie defaults, interactions,
hiding/undo, and algorithm provenance.

## Production

```bash
docker build -t openfeed .
docker run --rm -p 3001:3001 openfeed
```

The production server serves the built client and API from one origin. It uses an HTTP-only,
SameSite guest cookie, a strict content security policy, same-origin write checks, bounded JSON
bodies, and no collection of email addresses or passwords.

Guest sessions and preferences are intentionally stored in process memory because the demo handles
no durable identity or private account data. They expire after seven days and reset when the server
restarts. A multi-instance deployment should replace `SessionStore` with a shared TTL store while
keeping its interface.

## Architecture

```text
React client
  ├─ passwordless onboarding
  ├─ one-question AI companion
  ├─ ranked sources + concise brief
  └─ signal and algorithm explanations
          │ same-origin JSON
Express API
  ├─ in-memory guest sessions
  ├─ synthetic Earlybird/UTEG input adapter
  └─ exact TimelineRanker compatibility transform
          │ provenance
Original Scala source (unmodified)
```
