# ECR Repositories

This folder documents the container registries used by deployment.

Current contents:

- `repositories.json`: API and worker ECR repository names and URIs.

Future use:

- Add lifecycle policies for old image cleanup.
- Add image scanning settings and immutable tag policy once CI publishes build-specific tags.
