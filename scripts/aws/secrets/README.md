# Secrets Manager

This folder documents Secrets Manager resources by name and ARN only. It must never contain secret values.

Current contents:

- `secrets.json`: metadata for the ECS environment secret injected into API and worker task definitions.

Future use:

- Split API, worker, and lab runtime secrets if their permission boundaries diverge.
- Add rotation notes after production database credentials are managed through a rotation workflow.
