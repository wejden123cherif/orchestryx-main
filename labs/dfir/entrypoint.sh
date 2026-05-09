#!/bin/bash
# FLAG env var is unused — the flag lives inside MemLab1.vmem (embedded by MemLabs).
# Students find it by running Volatility plugins.

# Start SSH
/usr/sbin/sshd

# Health check HTTP server on :3000 for LabStack
python3 - << 'EOF' &
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        b = b"DFIR Lab ready. SSH: analyst@<ip>  pass: dfir2025!"
        self.send_response(200)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0", 3000), H).serve_forever()
EOF

echo "[+] DFIR lab ready. SSH :22  Health :3000"
tail -f /dev/null