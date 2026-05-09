# Troubleshooting Lab Runtime

Lab runtime provisioning is disabled in this build. `POST /labs/start` should return `501 Not Implemented` while `LAB_RUNTIME_ENABLED=false`.

## Where To Look

1. User lab detail page: current status, progress, and recent `/labs/{id}/events`.
2. Admin console `/admin`: failed labs, queued labs, status messages, and event log.
3. Worker logs: `make logs-worker` or CloudWatch `/ecs/orchestryx-worker`.
4. API logs: confirm the request was rejected before credit deduction.

## Common Failure Points

- `LAB_RUNTIME_ENABLED` is accidentally set to `true` before a replacement runtime exists.
- Legacy rows from an older runtime remain in `QUEUED`, `PROVISIONING`, or `STARTING`.
- A worker is not running, so stale-row cleanup does not execute.

## Useful Commands

```bash
make logs-worker
docker compose config
pytest
```

## Recovery

- User-owned labs can be stopped from My Labs or the lab detail page.
- Admins can stop labs from `/admin`.
- Expired labs are marked for cleanup.
- Stale provisioning labs are failed and refunded by the worker beat task.
- Any legacy cloud resources created before this cleanup must be handled manually outside the current runtime path.
