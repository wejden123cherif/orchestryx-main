# Apps

This folder contains user-facing application runtimes. Each child folder should be independently deployable or at least have a clear runtime boundary.

Current contents:

- `api/`: the FastAPI backend that exposes Orchestryx HTTP endpoints.
- `web/`: the Next.js frontend control plane.

Future use:

- Add additional admin or public gateway applications here if they become part of this monorepo.
- Keep background processing in `workers/` and AWS infrastructure in `infra/`.
