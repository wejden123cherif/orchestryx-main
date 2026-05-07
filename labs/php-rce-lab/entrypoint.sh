#!/bin/bash
set -e

FLAG=${FLAG:-"Securinets{rce_phtml_su1d_3sc4l4t10n_ch4ng3_m3}"}

echo "[rce-lab] Writing flag (root-only)..."
echo "$FLAG" > /root/flag.txt
chmod 400 /root/flag.txt

echo "[rce-lab] Setting SUID bit on find..."
chmod u+s /usr/bin/find

echo "[rce-lab] Cleaning stale uploads..."
find /var/www/html/uploads -type f \
    ! -name '.htaccess' ! -name '.gitkeep' -delete 2>/dev/null || true

echo "[rce-lab] Fixing permissions..."
chown -R www-data:www-data /var/www/html

echo "[rce-lab] Starting Apache..."
exec apache2-foreground