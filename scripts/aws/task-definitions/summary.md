# Task Definitions Summary

This folder contains ECS task definition JSON used by setup scripts.

Key files:

- `api-task.json`: FastAPI ECS task definition.
- `worker-task.json`: Celery worker ECS task definition.

Future use:

- Replace `latest` image tags with immutable CI build tags.
