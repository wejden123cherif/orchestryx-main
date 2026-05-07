#!/bin/bash
set -e

# Orchestryx injects FLAG when the lab starts. These defaults keep the image
# runnable by hand for local Docker testing.
FLAG=${FLAG:-"Securinets{lf1_d0ubl3_d3c0d3_3nv_forg3_ch4ng3_m3}"}
SECRET=${APP_SECRET:-"ch4ng3_th1s_k3y_pr0d_2024"}

# The final flag is root-readable only. Students reach it through the intended
# admin/LFI path, not by direct web access.
echo "[lfi-lab] Writing flag (root-only)..."
echo "$FLAG" > /root/flag.txt
chmod 400 /root/flag.txt

# Apache SetEnv exposes these values to PHP and /proc/self/environ, which is
# deliberate: leaking APP_SECRET via LFI lets the student forge the admin token.
echo "[lfi-lab] Injecting secrets into Apache environment..."
cat >> /etc/apache2/conf-enabled/app.conf <<CONF
SetEnv APP_SECRET ${SECRET}
SetEnv FLAG ${FLAG}
CONF

# Apache serves the copied app as www-data.
echo "[lfi-lab] Setting permissions..."
chown -R www-data:www-data /var/www/html

# Keep Apache in the foreground so Docker and the EC2 health path can track it.
echo "[lfi-lab] Starting Apache..."
exec apache2ctl -D FOREGROUND
