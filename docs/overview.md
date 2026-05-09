# Orchestryx Overview

Orchestryx is a cloud-native cyber range platform. The current repository focus is the reproducible control plane: API, web frontend, workers, database migrations, and AWS platform infrastructure through `infra/platform_cdk/`.

## Product Goal

The long-term product is a self-service lab range where users can:

- Sign up and authenticate through a managed identity provider.
- Fund an account with credits.
- Launch isolated hacking labs from pre-built templates.
- Later, design custom topologies with specific software versions, CVEs, routing, firewall rules, and network segmentation.
- Later, upload Docker-based workloads for custom lab environments.
- Access labs without direct AWS account access.
- Destroy labs manually or through automatic TTL expiry.

## MVP Scope

The MVP catalog is focused on pre-built templates. The API supports authentication, catalog reads, active lab listing, status polling, and lifecycle endpoints.

Lab runtime provisioning is disabled while the platform deployment path is stabilized. `POST /labs/start` returns `501 Not Implemented` with `LAB_RUNTIME_ENABLED=false`, before credit deduction or worker dispatch. Workers keep stale-row cleanup behavior but no longer deploy lab infrastructure.

## Current Deployment Direction

The backend and workers are deployed as ECS/Fargate services using ECR images. Production data lives in PostgreSQL/Aurora. SQS decouples asynchronous background work. Cognito owns identity. Secrets Manager stores runtime secrets. Platform infrastructure is defined in `infra/platform_cdk/`.

## Non-Goals For The Current MVP

- Users do not receive AWS credentials.
- Users do not directly operate CDK or CloudFormation.
- The custom topology builder is not complete yet.
- Docker upload and image scanning are future work.
- The old per-lab EC2 CDK runtime is not part of this repository.
