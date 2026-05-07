FROM php:7.4-apache

# Install GD extension (needed for mime_content_type image detection)
RUN apt-get update && apt-get install -y \
    libpng-dev libjpeg-dev libgd-dev dos2unix \
    && docker-php-ext-configure gd --with-jpeg \
    && docker-php-ext-install gd \
    && rm -rf /var/lib/apt/lists/*

# Enable mod_rewrite
RUN a2enmod rewrite

# Allow .htaccess to override settings in the entire web root
RUN printf '<Directory /var/www/html>\n\
    Options -Indexes\n\
    AllowOverride All\n\
    Require all granted\n\
</Directory>\n' > /etc/apache2/conf-enabled/site.conf

# Set DirectoryIndex so / serves index.php
RUN echo "DirectoryIndex index.php index.html" \
    > /etc/apache2/conf-enabled/dirindex.conf

# Harden
RUN printf 'ServerTokens Prod\nServerSignature Off\n' \
    > /etc/apache2/conf-enabled/harden.conf

# Copy application
COPY app/ /var/www/html/
COPY entrypoint.sh /entrypoint.sh

# Strip CRLF (Windows line endings break bash)
RUN dos2unix /entrypoint.sh && chmod +x /entrypoint.sh

# Remove default Apache page, set ownership
RUN rm -f /var/www/html/index.html && \
    chown -R www-data:www-data /var/www/html

# THE MISCONFIGURATION:
# Create uploads/ with .htaccess that blocks .php but allows .phtml
# php_admin_value is PHP_INI_SYSTEM — valid in server config and .htaccess
# when AllowOverride All is set
RUN mkdir -p /var/www/html/uploads && \
    printf '# Security policy: PHP execution restricted for uploaded files\n\
php_admin_flag engine Off\n\
<FilesMatch "\.phtml$">\n\
    php_admin_flag engine On\n\
</FilesMatch>\n' > /var/www/html/uploads/.htaccess && \
    chown -R www-data:www-data /var/www/html/uploads && \
    chmod 755 /var/www/html/uploads

ENV FLAG="Securinets{rce_phtml_su1d_3sc4l4t10n_ch4ng3_m3}"

EXPOSE 80
CMD ["/entrypoint.sh"]
