# Orchestryx Infra

This folder is the in-repo AWS CDK app used by the Orchestryx worker to create and destroy lab environments.

The backend worker calls `cdk deploy` and `cdk destroy` with this directory as `CDK_INFRA_PATH`. In Docker/ECS, the worker image copies this folder into the image so deployments do not depend on a separate sibling repository or host volume.

Current lab stacks create one isolated VPC and one EC2 host per lab. That is simple and isolated, but slow for short web labs because the host installs packages and pulls images during first boot. The next production speed step is a golden AMI or warm pool; see `docs/provisioning.md`.

## Local CDK Setup

```bash
cd infra
python -m venv .venv
.venv\Scripts\activate
pip install -r ..\requirements.txt
cdk synth
```

`cdk.context.json`, `.venv`, and `cdk.out` are generated local artifacts and should not be committed.
