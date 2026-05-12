# CI/CD

This page describes the initial GitHub Actions foundation for Orchestryx. The setup intentionally starts small: CI validates code and container builds without AWS credentials, while CD is a manual dev-only workflow that calls the existing deployment script.

## Workflows

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | Pull requests and pushes to `main` | Validate backend tests, frontend checks, Docker builds, and CDK synthesis. |
| Deploy dev | `.github/workflows/deploy-dev.yml` | Manual `workflow_dispatch` only | Build/push API and worker images and optionally force ECS dev service redeployments through `scripts/linux/deploy.sh`. |

There is no staging or production auto-deployment workflow yet.

## Repository audit summary

- Backend: `apps/api/` is a FastAPI app served by `uvicorn apps.api.main:app`.
- Backend tests: Python tests live under `tests/`; the Makefile exposes `make test`, which runs `pytest tests/ -v`.
- Python dependencies: root `requirements.txt` contains runtime, worker, CDK, and test dependencies.
- Frontend: `apps/web/` is a Next.js app using npm with `package-lock.json`.
- Frontend scripts: `dev`, `build`, `lint`, and `typecheck` are defined in `apps/web/package.json`.
- Containers: the API uses the root `Dockerfile`; the worker uses `Dockerfile.worker`. Both install the root Python requirements.
- Infrastructure: AWS CDK infrastructure is under `infra/platform_cdk/` and is synthesized with `cd infra/platform_cdk && cdk synth -c env=dev`.
- Deployment: Linux deployment uses `scripts/linux/deploy.sh`; Makefile shortcuts include `deploy-dev`, `platform-synth-dev`, `platform-diff-dev`, `platform-deploy-dev`, and `platform-export-dev`.

## What CI validates

The CI workflow runs only checks that should be safe without AWS deployment credentials:

1. Installs Python 3.11 dependencies from `requirements.txt`. The runner also installs the same libcurl/OpenSSL headers that the Python image needs for `pycurl`.
2. Compiles Python source under `apps/`, `workers/`, `scripts/`, `tests/`, and `alembic/` to catch syntax errors before runtime.
3. Validates that Alembic has a resolvable revision graph when migration files exist.
4. Runs `python -m pytest tests/ -v` when Python tests exist.
5. Installs frontend dependencies with `npm ci` in `apps/web/`.
6. Runs frontend `lint`, `typecheck`, and `build` only when those npm scripts exist.
7. Validates `docker-compose.yml` syntax with `docker compose config --quiet`.
8. Builds the API image from `Dockerfile`.
9. Builds the worker image from `Dockerfile.worker`.
10. Installs CDK dependencies from `infra/platform_cdk/requirements.txt` and runs `cdk synth -c env=dev` with placeholder `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` values so the synthesis step does not require live AWS credentials.

CI does not deploy infrastructure, push images, mutate AWS resources, run live database migrations, or require long-lived cloud credentials.

## CD status

`deploy-dev.yml` is a manual dev deployment workflow. It is intentionally not connected to pushes to `main` yet.

The workflow uses GitHub Actions OIDC through `aws-actions/configure-aws-credentials`. It then calls the existing deployment script instead of re-implementing deployment logic in YAML:

```bash
./scripts/linux/deploy.sh "$target"
```

The script supports these targets:

- `all`: build and push API and worker images, then update both ECS services.
- `api`: build and push the API image, then update the API ECS service.
- `worker`: build and push the worker image, then update the worker ECS service.
- `images`: build and push both images without ECS service updates.

## Required GitHub configuration for dev CD

Create a protected GitHub environment named `dev` and configure the following environment variables or repository variables/secrets. Prefer variables for non-sensitive identifiers and secrets only for values that must remain private.

| Name | Type | Purpose |
| --- | --- | --- |
| `AWS_ROLE_TO_ASSUME` | Environment variable or secret | IAM role ARN trusted by GitHub OIDC for this repository/environment. |
| `AWS_REGION` | Environment variable or secret | AWS region for dev deployment. |
| `AWS_ACCOUNT_ID` | Optional environment variable or secret | AWS account ID. If omitted, the deployment script asks STS for the current account. |
| `ORCHESTRYX_API_ECR_REPO_URI` | Environment variable | Existing dev API ECR repository URI. Required for every target. |
| `ORCHESTRYX_WORKER_ECR_REPO_URI` | Environment variable | Existing dev worker ECR repository URI. Required for every target. |
| `ORCHESTRYX_ECS_CLUSTER_NAME` | Environment variable | Existing dev ECS cluster name. Required for `all`, `api`, and `worker`; not required for `images`. |
| `ORCHESTRYX_API_SERVICE_NAME` | Environment variable | Existing dev API ECS service name. Required for `all`, `api`, and `worker`; not required for `images`. |
| `ORCHESTRYX_WORKER_SERVICE_NAME` | Environment variable | Existing dev worker ECS service name. Required for `all`, `api`, and `worker`; not required for `images`. |

The `images` target can be used earlier in a dev bootstrap because it only builds and pushes images. Service targets require the ECS cluster and services to already exist.

Do not configure long-lived AWS access keys for this workflow unless there is no viable OIDC option.

## AWS setup still required before CD works

Before running the dev deployment workflow, AWS must already have the platform resources that `scripts/linux/deploy.sh` updates:

1. An IAM role trusted for GitHub Actions OIDC. Restrict the trust policy to this repository and, ideally, the `dev` GitHub environment.
2. Least-privilege permissions for the OIDC role, limited to the dev ECR repositories and dev ECS cluster/services. Typical actions include ECR authorization/upload actions, `ecs:UpdateService`, `ecs:DescribeServices`, and `sts:GetCallerIdentity`.
3. Dev ECR repositories for API and worker images.
4. Dev ECS cluster and API/worker services created by the CDK platform deployment.
5. Runtime application secrets and environment values expected by ECS task definitions.
6. If schema migrations need to run, use the existing `scripts/linux/run-migrations.sh` flow separately after confirming the migration task variables exported by CDK (`ORCHESTRYX_MIGRATION_TASK_ARN`, `ORCHESTRYX_API_SG_ID`, and `ORCHESTRYX_PRIVATE_SUBNET_IDS`). The deploy workflow does not run migrations automatically.

## Manual deployment from GitHub

1. Open **Actions** in GitHub.
2. Select **Deploy dev**.
3. Choose **Run workflow**.
4. Select a target: `all`, `api`, `worker`, or `images`.
5. Provide an image tag. The default is `latest` to match the current deployment script behavior.
6. Leave **wait_for_stability** enabled when you want the workflow to wait for ECS service stability.

## Local verification commands

Useful local checks before pushing changes:

```bash
python -m pip install -r requirements.txt
python -m compileall apps workers scripts tests alembic
alembic heads --resolve-dependencies
python -m pytest tests/ -v
cd apps/web && npm ci && npm run lint && npm run typecheck && npm run build
docker compose config --quiet
docker build -f Dockerfile -t orchestryx-api:ci .
docker build -f Dockerfile.worker -t orchestryx-worker:ci .
python -m pip install -r infra/platform_cdk/requirements.txt
cd infra/platform_cdk && CDK_DEFAULT_ACCOUNT=000000000000 CDK_DEFAULT_REGION=eu-central-1 cdk synth -c env=dev
```

## Security notes

- Use GitHub Actions OIDC for AWS authentication.
- Do not store `.env` files in the repository.
- Do not print secrets or deployment credentials in workflow steps.
- Keep the dev deployment role scoped to dev resources only.
- Add staging or production deployment only after dev CI/CD is proven and reviewed.
