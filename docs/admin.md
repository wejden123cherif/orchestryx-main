# Admin Console

Admins can manage Orchestryx through the frontend `/admin` page and protected `/admin/*` API routes.

## Access Control

Admin routes require a valid Cognito bearer token and one of:

- `users.role = 'admin'` in the Orchestryx database.
- A Cognito `cognito:groups` claim containing `admin`.

Non-admin users receive `403 Admin access required`.

## Capabilities

- Dashboard overview: active, queued, provisioning, starting, ready, failed labs, total users, outstanding credits, and stale queue warning.
- User management: list users, roles, account status, credit balance, tier, and active-lab override.
- Credit management: add credits through an append-only `credit_transactions` row.
- Lab management: list recent lab instances, owner, template, status, progress, failure reason, stack name, IP, and lifecycle timestamps.
- System controls: stop labs as an admin, view recent provisioning/teardown events, and inspect the credit ledger.

## Operational Notes

The admin console is not a replacement for AWS observability. Use it for Orchestryx-owned state and quick intervention; use CloudWatch, CloudFormation, ECS, SQS, and Secrets Manager for low-level AWS diagnostics.

For initial local admin access, set a user row to admin:

```sql
UPDATE users SET role = 'admin' WHERE email = 'operator@example.com';
```
