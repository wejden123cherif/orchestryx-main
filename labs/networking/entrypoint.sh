#!/bin/bash
set -e

# Write the flag where students can read it after exploitation
echo "${FLAG:-FLAG_NOT_SET}" > /var/www/html/flag.txt
chmod 644 /var/www/html/flag.txt

# Start DVWA using its real entrypoint
exec docker-php-entrypoint apache2-foreground