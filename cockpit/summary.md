# Cockpit Summary

This folder contains a local operations cockpit for the Orchestryx AWS environment.

Key files and folders:

- `main.py`: FastAPI server that reads ECS, SQS, RDS, ECR, CloudWatch, Cognito, CloudFormation, and Cost Explorer data.
- `static/index.html`: single-page cockpit UI.
- `run.sh` and `run.ps1`: local startup helpers.
- `aws-overview.ps1`: CLI-style AWS inventory helper.
- `requirements.txt`: cockpit-only dependencies.

Future use:

- Add authentication before exposing the cockpit beyond a local developer machine.
- Add ALB, autoscaling, alarms, and trace visibility as production infrastructure expands.
