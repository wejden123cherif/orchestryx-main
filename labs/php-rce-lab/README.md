# CloudDrop PHP RCE Lab

# This lab is intentionally separate from `labs/sqli-lab`.
# Orchestryx builds it into its own Docker image and pushes it to:
# 254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx/php-rce-lab:latest

## What It Contains

- Apache + PHP 7.4
- A fake enterprise file-sharing app named CloudDrop
- An upload flow with blacklist-based extension filtering
- A deliberate `.phtml` execution misconfiguration in `uploads/.htaccess`
- A runtime flag written to `/root/flag.txt`
- A SUID `find` binary to support the privilege escalation path

## Orchestryx Integration

The worker runs this image with:

```bash
docker run -d --restart unless-stopped --name challenge -p 80:80 -e FLAG=ORCHESTRYX{<instance-id>} <image>
```

The `entrypoint.sh` script writes the injected flag into `/root/flag.txt`.
Students access the app after connecting to WireGuard at:

```text
http://10.8.0.1:80/
```

## Build And Push

```powershell
make push-php-rce-lab
```
