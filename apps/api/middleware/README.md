# Middleware And Dependencies

This folder contains FastAPI request middleware and dependency helpers that cut across route modules.

Current contents:

- `auth.py`: Cognito JWKS discovery, JWT verification, issuer validation, and `get_current_user`.

Future use:

- Add request correlation IDs, structured audit logging, rate limiting hooks, or tenant/context extraction here.
- Keep endpoint-specific authorization decisions close to the route or service that owns the resource.
