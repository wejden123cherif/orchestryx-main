FROM ghcr.io/volatilityfoundation/volatility3:latest

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssh-server python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -m -s /bin/bash analyst && \
    echo "analyst:dfir2025!" | chpasswd && \
    mkdir -p /var/run/sshd && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config && \
    echo 'alias vol="python3 /volatility3/vol.py -f ~/evidence/memory.vmem"' >> /home/analyst/.bashrc

COPY evidence/MemoryDump_Lab1.raw /home/analyst/evidence/memory.vmem
RUN chown -R analyst:analyst /home/analyst/evidence/

COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 22 3000
ENTRYPOINT ["/entrypoint.sh"]
