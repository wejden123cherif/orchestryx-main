FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install Apache + mod_php. This keeps the lab self-contained as a single
# container that a future Orchestryx lab runtime can run.
RUN apt-get update && apt-get install -y \
    apache2 php8.1 libapache2-mod-php8.1 dos2unix \
    && rm -rf /var/lib/apt/lists/*

# Switch to mpm_prefork; mod_php on Ubuntu 22.04 needs prefork instead of the
# default event/worker MPM.
RUN a2dismod mpm_event mpm_worker 2>/dev/null; \
    a2enmod mpm_prefork php8.1

# Make the portal load index.php when users visit http://10.8.0.1/.
RUN echo "DirectoryIndex index.php index.html" \
    > /etc/apache2/conf-enabled/php.conf

# Hide Apache version banners so the challenge looks less like a stock image.
RUN sed -i 's/ServerTokens OS/ServerTokens Prod/' /etc/apache2/conf-enabled/security.conf && \
    sed -i 's/ServerSignature On/ServerSignature Off/' /etc/apache2/conf-enabled/security.conf

# Copy only this LFI lab app into the image. Other labs live in their own
# folders and images.
COPY app/ /var/www/html/
COPY entrypoint.sh /entrypoint.sh

# Normalize Windows line endings before running the shell entrypoint inside
# Linux containers and set Apache ownership for the copied app.
RUN dos2unix /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    rm -f /var/www/html/index.html && \
    chown -R www-data:www-data /var/www/html

# Defaults for local/manual runs. Orchestryx overrides FLAG at lab start with
# ORCHESTRYX{<instance-id>}. APP_SECRET is intentionally exposed through the
# Apache environment because leaking it via LFI is the challenge mechanic.
ENV FLAG="Securinets{lf1_d0ubl3_d3c0d3_3nv_forg3_ch4ng3_m3}"
ENV APP_SECRET="ch4ng3_th1s_k3y_pr0d_2024"

# A future lab runtime should map challenge_port 80 to this container.
EXPOSE 80
CMD ["/entrypoint.sh"]
