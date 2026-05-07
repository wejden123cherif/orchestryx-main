# The Herald LFI Lab

# This lab is intentionally separate from `labs/sqli-lab` and
# `labs/php-rce-lab`.
# Orchestryx builds it into its own Docker image and pushes it to:
# 254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx/lfi-lab:latest

## What It Contains

- Ubuntu 22.04 + Apache + PHP 8.1
- A fake news portal named The Herald
- A double URL-decoding local file inclusion bug
- Apache environment secrets exposed through the LFI path
- An admin token flow based on `APP_SECRET`
- A runtime flag written to `/root/flag.txt` and exposed after admin access

## Orchestryx Integration

The worker runs this image with:

```bash
docker run -d --restart unless-stopped --name challenge -p 80:80 -e FLAG=ORCHESTRYX{<instance-id>} <image>
```

The `entrypoint.sh` script writes the injected flag into `/root/flag.txt`
and exposes `APP_SECRET` and `FLAG` to Apache for the challenge path.
Students access the app after connecting to WireGuard at:

```text
http://10.8.0.1:80/
```

## Build And Push

```powershell
make push-lfi-lab
```
