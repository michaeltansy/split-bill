# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript ^5.5.0 — all application source under `src/`
- SQL — Supabase schema and migrations under `supabase/migrations/` (`001_initial_schema.sql`, `002_assignments_session_id.sql`, `003_assignments_unit_split.sql`)

**Secondary:**
- JavaScript (ES module) — config files only (`next.config.js`, `postcss.config.mjs`)

## Runtime

**Environment:**
- Node.js >=20 (declared in `package.json` `engines.node`; Dockerfile base image `node:20-alpine`)
- No `.nvmrc` / `.node-version` file present

**Package Manager:**
- npm (lockfile: `package-lock.json` — committed)
- `npm ci` used in Docker `deps` stage

**Scripts (`package.json`):**
- `dev` → `next dev`
- `build` → `next build`
- `start` → `next start`
- `lint` → `next lint`
- `test` → `vitest`
- `test:run` → `vitest run`
- `test:coverage` → `vitest run --coverage`

## Frameworks

**Core:**
- Next.js ^15.2.0 — App Router (`src/app/`), Route Handlers for the API, edge `middleware.ts`
- React ^18.3.1 — UI rendering
- React DOM ^18.3.1 — DOM bindings

**Styling:**
- Tailwind CSS ^3.4.4 — utility-class CSS framework (`tailwind.config.ts`)
- PostCSS ^8.4.38 — pipeline (`postcss.config.mjs`)
- Autoprefixer ^10.4.19 — vendor-prefix output
- `next/font/google` Inter font loaded in `src/app/layout.tsx`

**Testing:**
- Vitest ^4.1.5 — test runner (`vitest.config.ts`)
- @testing-library/react ^16.3.2 — React component testing
- @testing-library/jest-dom ^6.9.1 — DOM matchers
- jsdom ^29.1.0 — browser environment for tests

**Build/Dev:**
- @vitejs/plugin-react ^6.0.1 — React plugin for Vitest's Vite-based test pipeline
- Next.js built-in compiler (SWC) — no Babel config detected
- `eslint-config-next` ^15.2.0 over `eslint` ^8.57.0

## Key Dependencies

**Production (`dependencies`):**

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.2.0 | Framework, App Router, route handlers, middleware |
| `react` | ^18.3.1 | UI library |
| `react-dom` | ^18.3.1 | DOM renderer |
| `@supabase/supabase-js` | ^2.45.0 | Postgres client + realtime; wired in `src/lib/supabase.ts` (browser + server clients) |
| `@google/generative-ai` | ^0.24.1 | Google Gemini SDK; used in `src/app/api/ocr/route.ts` (`gemini-2.5-flash-lite`) for receipt OCR |
| `@upstash/ratelimit` | ^2.0.8 | Sliding-window rate limiter; wired in `src/lib/ratelimit.ts` |
| `@upstash/redis` | ^1.38.0 | Upstash REST Redis client used by `@upstash/ratelimit` |
| `qrcode.react` | ^4.2.0 | `QRCodeSVG` component used in `src/components/ShareModal.tsx` |

**Development (`devDependencies`):**

| Package | Version |
|---------|---------|
| `typescript` | ^5.5.0 |
| `@types/node` | ^20.14.0 |
| `@types/react` | ^18.3.3 |
| `@types/react-dom` | ^18.3.0 |
| `eslint` | ^8.57.0 |
| `eslint-config-next` | ^15.2.0 |
| `tailwindcss` | ^3.4.4 |
| `autoprefixer` | ^10.4.19 |
| `postcss` | ^8.4.38 |
| `vitest` | ^4.1.5 |
| `@vitejs/plugin-react` | ^6.0.1 |
| `@testing-library/react` | ^16.3.2 |
| `@testing-library/jest-dom` | ^6.9.1 |
| `jsdom` | ^29.1.0 |

## Configuration

**TypeScript (`tsconfig.json`):**
- `strict: true`
- Path alias: `@/*` → `./src/*`
- `target: ES2017`, `module: esnext`, `moduleResolution: bundler`
- `jsx: preserve`, `isolatedModules: true`, `noEmit: true`
- `lib: [dom, dom.iterable, esnext]`
- `incremental: true` with `plugins: [{ name: "next" }]`
- Excludes: `node_modules`, `supabase/functions` (Deno code), `vitest.config.ts`, `src/test`, `**/*.test.{ts,tsx}`

**Tailwind (`tailwind.config.ts`):**
- Content paths cover `src/pages/`, `src/components/`, `src/app/`
- Custom CSS variables `background` and `foreground` exposed as theme colors

**PostCSS (`postcss.config.mjs`):**
- Plugins: `tailwindcss`, `autoprefixer`

**ESLint (`.eslintrc.json`):**
- Extends: `next/core-web-vitals` (no additional rules)

**Next.js (`next.config.js`):**
- Empty config object (no overrides). Standalone output is produced by Next.js defaults in the Docker build via `.next/standalone` copy in the Dockerfile.
- `NEXT_TELEMETRY_DISABLED=1` set in Dockerfile

**Vitest (`vitest.config.ts`):**
- Environment: `jsdom`
- `globals: true`
- Setup file: `src/test/setup.ts`
- Include pattern: `src/**/*.{test,spec}.{js,ts,jsx,tsx}`
- Coverage reporters: `text`, `json`, `html`
- Alias: `@` → `./src` mirroring `tsconfig.json`

## Test Tooling

- Vitest + React Testing Library + jsdom; setup at `src/test/setup.ts`
- Existing unit tests: `src/lib/calculations.test.ts`, `src/lib/validation.test.ts`
- No E2E framework configured

## Deployment Targets

**Docker (`Dockerfile`):**
- Multi-stage build using `node:20-alpine`
- Stages: `base` → `deps` (`npm ci`) → `builder` (`npm run build`) → `runner`
- Production user: non-root `nextjs:nodejs` (uid/gid 1001)
- Copies Next.js standalone artefact (`.next/standalone`) and `.next/static`
- Exposes port 3000; runs `node server.js`

**Docker Compose (`docker-compose.yml`):**
- Single `web` service, port mapping `3000:3000`
- `restart: unless-stopped`
- Env passthrough: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (defaults to `http://localhost:3000`)
- Note: `GEMINI_API_KEY` and Upstash variables are NOT forwarded in `docker-compose.yml` despite being required for OCR and rate limiting respectively (gap)

**Other targets:**
- Vercel-compatible (Next.js 15 App Router), but no `vercel.json` committed
- Supabase Edge Functions deployment for `cleanup-sessions` (Deno runtime, separate `supabase functions deploy`)

## Platform Requirements

**Development:**
- Node.js >=20
- npm with committed lockfile
- A Supabase project (URL + anon key + service-role key)
- Optional: `GEMINI_API_KEY` to enable receipt scan UI (`NEXT_PUBLIC_OCR_ENABLED=true`)
- Optional: Upstash Redis REST credentials to enable rate limiting

**Production:**
- Docker host capable of running the standalone Next.js server, or any Node 20 runtime
- Supabase project with migrations `001`–`003` applied
- (Optional) Supabase CLI to deploy the `cleanup-sessions` edge function on cron

---

*Stack analysis: 2026-05-12*
