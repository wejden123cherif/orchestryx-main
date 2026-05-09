# Orchestryx Infra

`infra/platform_cdk/` is the only active infrastructure-as-code entry point for Orchestryx.

The removed per-lab EC2 CDK app is no longer part of this repository. Workers no longer shell out to `cdk deploy` or `cdk destroy` for lab stacks, and lab runtime provisioning is disabled until a new runtime is implemented.

Current structure:

- `apps/api`: FastAPI backend.
- `apps/web`: Next.js frontend.
- `workers`: async background services.
- `infra/platform_cdk`: AWS platform infrastructure.
- `labs`: lab image source folders kept for future use.
- `alembic`: database migrations.

## Platform CDK

```bash
cd infra/platform_cdk
cdk synth -c env=dev
```

See `infra/platform_cdk/README.md` for environment config, deployment safety, and the map from legacy/manual AWS resources to platform CDK stacks.
