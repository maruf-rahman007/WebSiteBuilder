# Website Builder

Describe a React app; watch it get written file by file, run live in the browser (WebContainers), edit the code, and download it.

## Quick start

```bash
npm install
cp apps/server/.env.example apps/server/.env   # then set OPENROUTER_API_KEY
npm run dev                                    # web: http://localhost:5173  api: :8787
```

Use a recent Chrome/Edge/Firefox. WebContainers need the COOP/COEP headers, which the dev server already sends.

## Scripts

| Command                | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | API (tsx watch) + web (Vite) together          |
| `npm run check`        | typecheck + lint + format check + tests        |
| `npm run build`        | Production build of server and web             |
| `npm start`            | Run the built server                           |
| `docker build -t wb .` | Single image: API + web served from one origin |

## Layout

```
packages/shared   Stream protocol (Zod), request limits, SSE decoder, path safety
apps/server       Express 5 API
  generation/       system prompt, prompt builder, streaming artifact parser, run orchestration
  llm/              LlmProvider interface + OpenRouter implementation
  http/             SSE writer (backpressure, heartbeats), rate + concurrency limits
apps/web          Vite + React 19 client
  runtime/          WebContainer singleton: boot, ordered writes, npm install, dev server
  features/         generation controller + per-turn session, project actions
  stores/           zustand: project files (source of truth), chat/steps, runtime, ui
  components/       landing, chat, workbench (file tree, CodeMirror, preview, terminal)
```

## How a generation flows

1. The browser POSTs the chat history plus **all current files** to `/api/generate`. The server is stateless.
2. The server streams the model's output through `ArtifactParser`. It understands `<artifact>` / `<action type="file|delete">` tags, works no matter how the text is chunked, and strips the code fences free models like to add.
3. The server sends typed SSE events: `action.started` → `action.delta`… → `action.completed`, along with `message.delta`, `reasoning.delta`, `run.warning`, `run.error` and `run.completed`.
4. The browser streams each file into the editor as it's written and writes it into the WebContainer. If dependencies changed, it re-runs `npm install`, then starts or refreshes the Vite preview. Each step moves through pending → running → done/error.
5. Preview runtime errors show a **Fix with AI** button.

The model never runs shell commands. Dependencies are managed only through `package.json`.

## Configuration

See `apps/server/.env.example`. Key settings:

- `OPENROUTER_MODELS` is the allowlist; its first entry is the default.
- `OPENROUTER_FALLBACK_MODELS` lists models that take over when a free model returns 429.
- `REASONING_EFFORT` caps how long reasoning models think.
- The rate-limit, timeout and `TRUST_PROXY` settings matter in production.

## Known limits / roadmap ideas

- Rate limiting is in memory, so it only works on a single instance. Use a Redis store when you scale out.
- There's no persistence: a reload loses the project. Snapshots in IndexedDB would be a cheap v2.
- WebContainers need a StackBlitz commercial license for production commercial use.
