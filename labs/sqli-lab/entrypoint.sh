#!/bin/bash
set -e

echo "[*] Starting MySQL..."
service mysql start

echo "[*] Waiting for MySQL to be ready..."
for i in $(seq 1 40); do
    if mysqladmin ping --silent 2>/dev/null; then
        echo "[*] MySQL ready after ${i}s"
        break
    fi
    sleep 1
done

echo "[*] Loading database schema..."
mysql -u root < /init.sql

if [ -n "$FLAG" ]; then
    echo "[*] Injecting runtime flag..."
    mysql -u root corpdb -e "UPDATE vault SET secret='$FLAG' WHERE entry_name='flag';"
fi

echo "[*] Creating restricted app user..."
mysql -u root -e "
    CREATE USER IF NOT EXISTS 'appuser'@'localhost' IDENTIFIED BY 'C0rpApp2024';
    GRANT SELECT ON corpdb.employees     TO 'appuser'@'localhost';
    GRANT SELECT ON corpdb.vault         TO 'appuser'@'localhost';
    GRANT SELECT ON corpdb.announcements TO 'appuser'@'localhost';
    FLUSH PRIVILEGES;
"

echo "[*] Setting permissions..."
chown -R www-data:www-data /var/www/html

echo "[*] Starting Apache..."
exec apache2ctl -D FOREGROUND