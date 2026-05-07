# Orchestryx Overview

Orchestryx is a cloud-native cyber range platform. It gives users on-demand cybersecurity lab environments in the same spirit that Vercel gives developers on-demand application deployment: the user asks for an environment, the platform provisions it, exposes access material, tracks lifecycle state, and destroys it when finished.

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

The MVP is focused on pre-built templates. The current seed catalog includes a Juice Shop SQL injection lab template. The API supports authentication, catalog reads, lab start, active lab listing, status polling, WireGuard config download, and teardown.

Provisioning is asynchronous. The API writes the lab record, records the credit debit, and pushes work to SQS/Celery. Workers deploy AWS infrastructure through CDK/CloudFormation, update progress through `QUEUED`, `PROVISIONING`, `STARTING`, and `READY`, store VPN access material, and clean up expired or failed labs.

## Current Deployment Direction

The backend and workers are deployed as ECS/Fargate services using ECR images. Production data lives in Aurora Serverless v2. SQS decouples user requests from long-running infrastructure work. Cognito owns identity. Secrets Manager stores runtime secrets and generated lab access material.

## Non-Goals For The Current MVP

- Users do not receive AWS credentials.
- Users do not directly operate CDK or CloudFormation.
- The custom topology builder is not complete yet.
- Docker upload and image scanning are future work.
- Startup `create_all` is still MVP-only and must be replaced by migrations before real production rollout.
