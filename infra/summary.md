# Infra Summary

This folder contains the AWS CDK app used to define lab infrastructure.

Key files and folders:

- `app.py`: CDK app entry point.
- `cdk.json`: CDK runtime configuration.
- `orchestryx_infra/`: CDK stack package.
- `tests/`: CDK unit tests.

Future use:

- Add reusable lab constructs and environment-specific stack configuration here.
- Keep deployment-time context inputs documented when workers pass values into CDK.
