# ──────────────────────────────────────────────────────────────────────
# Orchestryx SQLi Lab — NexBank Corporate Portal
# ──────────────────────────────────────────────────────────────────────
# This Dockerfile builds a self-contained vulnerable web application:
#   - Ubuntu 22.04 + Apache + PHP 8.1 + MySQL (all in one container)
#   - A fake banking portal ("NexBank") with SQL injection vulnerabilities
#   - The flag is stored in the MySQL "vault" table
#
# HOW IT INTEGRATES WITH ORCHESTRYX:
#   1. The Orchestryx provisioning worker does:
#        docker run -d -p 80:80 -e FLAG=ORCHESTRYX{...} <ecr-uri>
#   2. entrypoint.sh reads the FLAG env var and injects it into MySQL
#   3. Student connects via WireGuard → exploits SQLi → reads vault → finds flag
#
# BUILD & PUSH:
#   See labs/sqli-lab/push-to-ecr.ps1 for the automated build & push script.
# ──────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install Apache, PHP, MySQL — all run inside one container for simplicity.
# In production you'd separate these, but for a lab exercise this is fine.
RUN apt-get update && apt-get install -y \
    apache2 \
    php8.1 \
    php8.1-mysql \
    libapache2-mod-php8.1 \
    mysql-server \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

# Ubuntu 22.04 uses mpm_event by default — must switch to mpm_prefork for mod_php.
# mod_php requires the prefork MPM because it is not thread-safe.
RUN a2dismod mpm_event mpm_worker 2>/dev/null; \
    a2enmod mpm_prefork php8.1

# Make Apache execute .php files by default (index.php before index.html)
RUN echo "DirectoryIndex index.php index.html" \
    > /etc/apache2/conf-enabled/php.conf

# Harden Apache: hide version info from HTTP headers.
# This makes the lab slightly more realistic — students can't trivially
# fingerprint the server version.
RUN sed -i 's/ServerTokens OS/ServerTokens Prod/' /etc/apache2/conf-enabled/security.conf && \
    sed -i 's/ServerSignature On/ServerSignature Off/' /etc/apache2/conf-enabled/security.conf

# Copy the vulnerable PHP application into Apache's document root.
COPY app/ /var/www/html/
# Copy the MySQL schema that creates corpdb, employees, vault, announcements.
COPY init.sql /init.sql
# Copy the startup script that initializes MySQL and Apache.
COPY entrypoint.sh /entrypoint.sh

# Strip Windows CRLF line endings (critical when building from Windows).
# Remove the default Apache index.html so index.php (login page) is served.
RUN dos2unix /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    rm -f /var/www/html/index.html && \
    chown -R www-data:www-data /var/www/html

# Default flag — overridden at runtime by the Orchestryx provisioning worker.
# The worker passes: docker run -e FLAG=ORCHESTRYX{<instance-uuid>}
# entrypoint.sh reads $FLAG and injects it into the vault table.
ENV FLAG="ORCHESTRYX{sql_injection_default}"

# Apache serves on port 80. This must match challenge_port in seeds.py.
EXPOSE 80

# entrypoint.sh: starts MySQL → loads schema → injects flag → starts Apache
CMD ["/entrypoint.sh"]
