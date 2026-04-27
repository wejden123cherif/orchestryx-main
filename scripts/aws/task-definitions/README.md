# ECS Task Definitions

This folder contains the exact task definition JSON files registered by `scripts/setup-aws.sh` and `scripts/setup-aws.ps1`.

Current contents:

- `api-task.json`: FastAPI service task definition. It runs `apps.api.main:app` with Uvicorn on port `8000`.
- `worker-task.json`: Celery worker task definition. It runs the provision and destroy workers with the solo pool.

Both task definitions use Fargate, `awsvpc` networking, ECR images, Secrets Manager environment injection, and CloudWatch Logs.

Future use:

- Add CPU and memory variants for staging and production.
- Add health checks once the API is behind an Application Load Balancer.
- Replace `latest` image tags with immutable build tags in CI/CD.
