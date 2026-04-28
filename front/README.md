# Orchestryx Frontend

Next.js 16 control plane for Orchestryx, a cyber range SaaS platform where security teams, universities, and trainers launch isolated AWS lab environments through a polished cloud console.

The UI presents Orchestryx like enterprise infrastructure software: dense, dark, quiet, and operational. It avoids CTF or hacker visual language while still supporting cybersecurity lab workflows.

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
components/dashboard/   Fixed sidebar console shell
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
- `GET /labs/{instance_id}/config`
- `DELETE /labs/{instance_id}`

No placeholder API calls are used. Areas without a backend contract, such as full historical billing, show graceful explanatory empty states.

## UI Flows

- Landing page: product positioning and console entry.
- Auth: centered login/register cards and six-digit confirmation code entry.
- Dashboard: credits chip, stats, active labs table, VPN config and stop actions.
- Catalog: search, category filters, lab cards, and start actions.
- Catalog detail: lab overview, practice summary, sticky launch panel, insufficient credits state.
- Lab detail: provisioning progress, running VPN instructions, destroyed/failed recovery state.
- Account: profile, credit balance, and usage table based on available lab data.
