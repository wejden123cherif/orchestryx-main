# Windows Scripts

This folder contains PowerShell scripts for Windows teammates.

Current contents:

- `deploy.ps1`: PowerShell deployment flow for API and worker images.
- `setup-aws.ps1`: PowerShell equivalent of the idempotent AWS setup script.

Future use:

- Add Windows-friendly helpers for logs, service status, and cockpit startup.
- Keep behavior aligned with the Bash scripts so teammates can use either platform confidently.
