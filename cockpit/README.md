# Orchestryx Cockpit

The cockpit is a lightweight local operations console for the Orchestryx AWS environment. It gives the team a focused view of ECS services, running tasks, SQS queues, Aurora status, Cognito, ECR images, CloudWatch logs, lab stacks, network placement, and current Cost Explorer data without moving through the AWS Console.

Run it from the repo root with:

```bash
make cockpit
```

Or directly:

```bash
cd cockpit
uvicorn main:app --reload --port 9000
```

The app uses your local AWS credentials and only targets the known `eu-central-1` Orchestryx account resources. The deploy and restart buttons call the repo scripts and ECS APIs, so treat it as an operator tool.

Future use:

- Add authentication before exposing it outside a local developer machine.
- Add ALB, target group, autoscaling, and alarm views when those resources are added.
- Replace broad actions with role-gated controls if the cockpit becomes a shared internal service.
