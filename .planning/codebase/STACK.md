# Technology Stack

**Analysis Date:** 2026-05-08

## Languages

**Primary:**
- TypeScript 5.5.x — all application source under `src/`
- SQL — Supabase schema migrations (`supabase/migrations/001_initial_schema.sql`)

**Secondary:**
- Go — stray file `src/hooks/lru.go` (not part of the build; appears to be a leftover artifact)

## Runtime

**Environment:**
- Node.js 20 (pinned in `Dockerfile`: `FROM node:20-alpine`)
- No `.nvmrc` or `.node-version` file present; local Node.js version in use is 22.12.0

**Scripts require:**
- `NODE_OPTIONS=--openssl-legacy-provider` flag on all `next dev/build/start` commands (needed for OpenSSL compatibility on Node 17+)

**Package Manager:**
- npm (lockfile: `package-lock.json` — present and committed)

## Frameworks

**Core:**
- Next.js ^15.2.0 — full-stack React framework; App Router used (`src/app/`)
- React ^18.3.1 — UI rendering
- React DOM ^18.3.1 — DOM bindings

**Styling:**
- Tailwind CSS ^3.4.4 — utility-class CSS framework
- PostCSS ^8.4.38 — CSS processing pipeline (`postcss.config.mjs`)
- Autoprefixer ^10.4.19 — vendor-prefix CSS output

**Testing:**
- Vitest ^4.1.5 — test runner (config: `vitest.config.ts`)
- @testing-library/react ^16.3.2 — React component testing utilities
- @testing-library/jest-dom ^6.9.1 — DOM matchers
- jsdom ^29.1.0 — browser environment simulation in tests

**Build/Dev:**
- @vitejs/plugin-react ^6.0.1 — React plugin for Vitest's Vite-based test runner
- Next.js built-in compiler (SWC) — no separate Babel config detected

## Key Dependencies

**Critical:**
- `@google/generative-ai` ^0.24.1 — Google Gemini AI SDK; used exclusively in `src/app/api/ocr/route.ts` to drive receipt parsing via `gemini-2.0-flash` model
- `@supabase/supabase-js` ^2.45.0 — Supabase client; used in `src/lib/supabase.ts` for both browser (anon key) and server (service role key) clients
- `qrcode.react` ^4.2.0 — QR code generation component (`QRCodeSVG`) used in `src/components/ShareModal.tsx`

**Infrastructure:**
- None beyond the above (no Redis, no message queue, no additional ORM layer)

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- `strict: true` enabled
- Path alias: `@/*` → `./src/*`
- Target: ES2017; module: esnext; moduleResolution: node
- `isolatedModules: true` (required for Next.js SWC)
- `noEmit: true` (Next.js owns the emit step)

**Tailwind:**
- Config: `tailwind.config.ts`
- Content paths cover `src/pages/`, `src/components/`, `src/app/`
- Custom CSS variables for `background` and `foreground` colours

**ESLint:**
- Config: `.eslintrc.json`
- Extends: `next/core-web-vitals` (no additional rules configured)

**Next.js:**
- Config: `next.config.js`
- `output: 'standalone'` — produces a self-contained build artefact for Docker deployment

**Vitest:**
- Config: `vitest.config.ts`
- Environment: `jsdom`
- Globals enabled
- Setup file: `src/test/setup.ts`
- Test include pattern: `src/**/*.{test,spec}.{js,ts,jsx,tsx}`
- Coverage reporters: text, json, html

## Dev vs Prod Dependency Split

**Production (`dependencies`):**
| Package | Version |
|---------|---------|
| `@google/generative-ai` | ^0.24.1 |
| `@supabase/supabase-js` | ^2.45.0 |
| `next` | ^15.2.0 |
| `qrcode.react` | ^4.2.0 |
| `react` | ^18.3.1 |
| `react-dom` | ^18.3.1 |

**Development (`devDependencies`):**
| Package | Version |
|---------|---------|
| `@testing-library/jest-dom` | ^6.9.1 |
| `@testing-library/react` | ^16.3.2 |
| `@types/node` | ^20.14.0 |
| `@types/react` | ^18.3.3 |
| `@types/react-dom` | ^18.3.0 |
| `@vitejs/plugin-react` | ^6.0.1 |
| `autoprefixer` | ^10.4.19 |
| `eslint` | ^8.57.0 |
| `eslint-config-next` | ^15.2.0 |
| `jsdom` | ^29.1.0 |
| `postcss` | ^8.4.38 |
| `tailwindcss` | ^3.4.4 |
| `typescript` | ^5.5.0 |
| `vitest` | ^4.1.5 |

## Platform Requirements

**Development:**
- Node.js 20+ (22.x works with `--openssl-legacy-provider`)
- npm (lockfile present)

**Production:**
- Docker (multi-stage `Dockerfile` using `node:20-alpine`)
- Docker Compose (`docker-compose.yml`) for single-container deployment on port 3000
- Next.js standalone output mode — runs as `node server.js`
- Supabase project (cloud or self-hosted) for database
- Gemini API key for OCR functionality

---

*Stack analysis: 2026-05-08*
