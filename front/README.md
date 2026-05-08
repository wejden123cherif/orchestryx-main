# Orchestryx Frontend

Next.js 16 control plane for Orchestryx, a cyber range SaaS platform where security teams, universities, and trainers launch isolated AWS lab environments through a polished cloud console.

The user console now follows the visual language of the MIT-licensed `arhamkhnz/next-shadcn-admin-dashboard` template: neutral shadcn tokens, grouped sidebar navigation, a sticky command bar, compact cards, and operational tables. The admin route remains Cloudscape-based and intentionally separate.

## Commands

```bash
cd front
npm install
npm run dev
npm run build
```

Optional checks:

```bash
npm run typecheck
npm run lint
```

## Environment

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

All backend requests are made through `lib/api.ts`, which reads `NEXT_PUBLIC_API_URL` and attaches the current in-memory bearer token.

## Structure

```text
app/                    App Router pages and route groups
app/(auth)/             Login, registration, and email confirmation
app/(protected)/        Authenticated console routes
components/auth/        Shared auth form shell and password input
components/dashboard/   Template-inspired protected user console shell
components/platform/    Lab-specific cards, empty states, and status badges
components/ui/          Small shadcn-style primitives: badge, button, skeleton, toast
context/                Auth provider
hooks/                  Context access hooks
lib/                    API client, backend calls, shared types, utilities
```

## Backend Integration

Implemented against the existing FastAPI contracts:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/confirm`
- `POST /auth/refresh`
- `GET /me`
- `GET /catalog`
- `GET /catalog/{template_id}`
- `POST /labs/start`
- `GET /labs/active`
- `GET /labs/{instance_id}/status`
- `GET /labs/{instance_id}/events`
- `GET /labs/{instance_id}/config`
- `DELETE /labs/{instance_id}`
- `GET /admin/overview`
- `GET /admin/users`
- `GET /admin/labs`
- `GET /admin/events`
- `GET /admin/credits`

No placeholder API calls are used. Areas without a backend contract, such as payment-backed credit purchase, use an explicit request-credits path instead of pretending to charge cards.

## UI Flows

- Landing page: product positioning and console entry.
- Auth: centered login/register cards and six-digit confirmation code entry.
- Dashboard: template-inspired shell, command bar links, credits, active labs, provisioning progress, VPN config, stop actions, quick launch, and workspace links.
- Catalog: search, category filters, lab cards, and start actions.
- Catalog detail: lab overview, practice summary, sticky launch panel, insufficient credits state.
- Lab detail: queued/provisioning/starting progress, recent provisioning events, ready-state VPN instructions, stopped/expired/failed recovery state.
- Account: profile, credit balance, credit policy note, request-credit path, and usage table based on available lab data.
- Admin: Cloudscape operations console for AWS/lab inspection. It does not use the shadcn dashboard shell.

## Dashboard UI Notes

- Source inspiration: https://github.com/arhamkhnz/next-shadcn-admin-dashboard
- The external template is not vendored into this repo. Orchestryx adapts its layout and neutral theme tokens while keeping existing auth, routing, API clients, and lab actions.
- Global colors live in `app/globals.css`.
- The protected user shell lives in `components/dashboard/protected-shell.tsx`.
- The main user dashboard lives in `app/(protected)/dashboard/page.tsx`.
- Keep `/admin` separate from this shell; `app/(protected)/layout.tsx` bypasses the user shell for admin so Cloudscape can own that route.
