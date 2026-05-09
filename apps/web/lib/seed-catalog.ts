import type { LabTemplate } from "@/lib/types";

export const seedCatalog: LabTemplate[] = [
  // ── Web Application Security ──
  {
    id: "owasp-juice-shop",
    title: "OWASP Juice Shop",
    category: "Web App",
    difficulty: "Easy",
    description:
      "Intentionally insecure web app covering the OWASP Top 10. Includes score board with 100+ challenges from injection to broken access control.",
    credits_cost: 2,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 3000,
    challenge_path: "/",
  },
  {
    id: "dvwa",
    title: "DVWA",
    category: "Web App",
    difficulty: "Easy",
    description:
      "Damn Vulnerable Web Application. PHP/MySQL app with adjustable security levels — practice SQL injection, XSS, CSRF, file inclusion, and command injection.",
    credits_cost: 1,
    ttl_hours: 4,
    instance_type: "t3.micro",
    challenge_port: 80,
    challenge_path: "/",
  },
  {
    id: "webgoat",
    title: "WebGoat / WebWolf",
    category: "Web App",
    difficulty: "Medium",
    description:
      "OWASP teaching platform with guided lessons on authentication flaws, JWT attacks, XXE, deserialization, and server-side request forgery.",
    credits_cost: 2,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 8080,
    challenge_path: "/WebGoat",
  },
  {
    id: "hackazon",
    title: "Hackazon",
    category: "Web App",
    difficulty: "Medium",
    description:
      "Realistic e-commerce app with REST API, SOAP services, and a modern JS frontend. Targets advanced web attacks including API abuse and business logic flaws.",
    credits_cost: 3,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 80,
    challenge_path: "/",
  },

  // ── CI/CD & Supply Chain ──
  {
    id: "cicd-goat",
    title: "CI/CD Goat",
    category: "CI/CD",
    difficulty: "Medium",
    description:
      "Deliberately vulnerable CI/CD environment with Jenkins, Gitea, and ArgoCD. Practice pipeline poisoning, credential theft, and dependency confusion.",
    credits_cost: 5,
    ttl_hours: 6,
    instance_type: "t3.medium",
    challenge_port: 8080,
    challenge_path: "/",
  },
  {
    id: "gitea-actions-lab",
    title: "Gitea Actions Lab",
    category: "CI/CD",
    difficulty: "Hard",
    description:
      "Self-hosted Git forge with vulnerable GitHub Actions-compatible workflows. Exploit workflow injection, secret exfiltration, and artifact poisoning.",
    credits_cost: 4,
    ttl_hours: 6,
    instance_type: "t3.small",
    challenge_port: 3000,
    challenge_path: "/",
  },

  // ── Vulnerable Machines (VulnHub-style) ──
  {
    id: "metasploitable-2",
    title: "Metasploitable 2",
    category: "VulnHub",
    difficulty: "Easy",
    description:
      "Classic intentionally vulnerable Linux VM. Dozens of exploitable services including vsftpd, Samba, Tomcat, distcc, and PostgreSQL.",
    credits_cost: 2,
    ttl_hours: 6,
    instance_type: "t3.small",
    challenge_port: 80,
    challenge_path: "/",
  },
  {
    id: "metasploitable-3-linux",
    title: "Metasploitable 3 — Linux",
    category: "VulnHub",
    difficulty: "Medium",
    description:
      "Modern successor with ProFTPD, Drupal, Apache Struts, and a vulnerable Rails app. Flags hidden across the filesystem for CTF-style scoring.",
    credits_cost: 3,
    ttl_hours: 6,
    instance_type: "t3.small",
    challenge_port: 80,
    challenge_path: "/",
  },
  {
    id: "metasploitable-3-win",
    title: "Metasploitable 3 — Windows",
    category: "VulnHub",
    difficulty: "Medium",
    description:
      "Windows Server 2008 R2 with IIS, ManageEngine, Elasticsearch, Apache Axis2, and misconfigured SMB shares. Practice Windows exploitation and post-exploitation.",
    credits_cost: 4,
    ttl_hours: 6,
    instance_type: "t3.medium",
    challenge_port: 80,
    challenge_path: "/",
  },
  {
    id: "mrrobot-ctf",
    title: "Mr-Robot CTF",
    category: "VulnHub",
    difficulty: "Medium",
    description:
      "Based on the TV series. WordPress exploitation, privilege escalation via SUID binaries, and three hidden keys. A fan-favourite boot-to-root.",
    credits_cost: 2,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 80,
    challenge_path: "/",
  },
  {
    id: "stapler",
    title: "Stapler",
    category: "VulnHub",
    difficulty: "Medium",
    description:
      "Multi-vector attack surface: FTP, SSH, SMB, MySQL, and multiple web apps. Over 4 privilege escalation paths for creative exploitation.",
    credits_cost: 2,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 80,
    challenge_path: "/",
  },
  {
    id: "dc-series-1",
    title: "DC-1",
    category: "VulnHub",
    difficulty: "Easy",
    description:
      "Drupal CMS with known RCE. Enumerate, exploit, and escalate to root through SUID find binary. Five flags to collect.",
    credits_cost: 1,
    ttl_hours: 4,
    instance_type: "t3.micro",
    challenge_port: 80,
    challenge_path: "/",
  },

  // ── Active Directory ──
  {
    id: "goad-lab",
    title: "GOAD — Game of Active Directory",
    category: "Active Directory",
    difficulty: "Hard",
    description:
      "Full AD forest with 5 machines, 2 domains, and a trust relationship. Practice Kerberoasting, AS-REP roasting, ACL abuse, delegation attacks, and Golden Ticket.",
    credits_cost: 12,
    ttl_hours: 8,
    instance_type: "t3.large",
    challenge_port: 0,
    challenge_path: "",
  },
  {
    id: "vulnerable-ad",
    title: "Vulnerable AD — Single Domain",
    category: "Active Directory",
    difficulty: "Medium",
    description:
      "Windows Server DC with misconfigured GPOs, weak Kerberos policies, and vulnerable service accounts. Ideal for learning AD enumeration with BloodHound.",
    credits_cost: 6,
    ttl_hours: 6,
    instance_type: "t3.medium",
    challenge_port: 0,
    challenge_path: "",
  },
  {
    id: "ad-recycle-bin",
    title: "AD Persistence Lab",
    category: "Active Directory",
    difficulty: "Hard",
    description:
      "Pre-compromised domain with planted persistence: golden tickets, skeleton keys, DCShadow artifacts, and rogue GPOs. Practice detection and incident response.",
    credits_cost: 8,
    ttl_hours: 6,
    instance_type: "t3.medium",
    challenge_port: 0,
    challenge_path: "",
  },

  // ── Network Pentesting ──
  {
    id: "network-pivoting",
    title: "Pivot Lab — Multi-Subnet",
    category: "Network",
    difficulty: "Hard",
    description:
      "Three-tier network with DMZ, internal, and management VLANs. Practice SSH tunneling, proxychains, and multi-hop pivoting to reach the final target.",
    credits_cost: 8,
    ttl_hours: 6,
    instance_type: "t3.medium",
    challenge_port: 0,
    challenge_path: "",
  },
  {
    id: "wireless-sim",
    title: "Wireless Security Lab",
    category: "Network",
    difficulty: "Medium",
    description:
      "Simulated wireless environment with WPA2, WPA3, and enterprise RADIUS. Practice handshake capture, evil twin, and 802.1X attacks without physical hardware.",
    credits_cost: 4,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 0,
    challenge_path: "",
  },

  // ── DFIR / Forensics ──
  {
    id: "memory-forensics",
    title: "Memory Forensics — Volatility",
    category: "DFIR",
    difficulty: "Medium",
    description:
      "Pre-captured memory dumps from compromised Windows and Linux systems. Analyze with Volatility 3 to identify malware, extract credentials, and reconstruct timelines.",
    credits_cost: 3,
    ttl_hours: 6,
    instance_type: "t3.small",
    challenge_port: 0,
    challenge_path: "",
  },
  {
    id: "siem-lab",
    title: "SIEM & Log Analysis",
    category: "DFIR",
    difficulty: "Medium",
    description:
      "Preconfigured Wazuh + ELK stack ingesting logs from a simulated breach. Correlate events, build detection rules, and write an incident report.",
    credits_cost: 6,
    ttl_hours: 8,
    instance_type: "t3.medium",
    challenge_port: 5601,
    challenge_path: "/",
  },
  {
    id: "disk-forensics",
    title: "Disk Image Analysis",
    category: "DFIR",
    difficulty: "Hard",
    description:
      "E01 disk images from a simulated insider threat. Use Autopsy and Sleuth Kit to recover deleted files, browser artifacts, and USB connection history.",
    credits_cost: 4,
    ttl_hours: 6,
    instance_type: "t3.medium",
    challenge_port: 0,
    challenge_path: "",
  },

  // ── Malware Analysis ──
  {
    id: "remnux-flarevm",
    title: "REMnux + FlareVM Sandbox",
    category: "Malware",
    difficulty: "Medium",
    description:
      "Dual-VM sandbox with REMnux for Linux-based analysis and FlareVM for Windows RE. Pre-loaded with Ghidra, x64dbg, YARA, and sample packs.",
    credits_cost: 6,
    ttl_hours: 8,
    instance_type: "t3.medium",
    challenge_port: 0,
    challenge_path: "",
  },
  {
    id: "malware-traffic",
    title: "Malware Traffic Analysis",
    category: "Malware",
    difficulty: "Easy",
    description:
      "PCAP captures from real malware families. Identify C2 beacons, exfiltration channels, and lateral movement using Wireshark and Zeek.",
    credits_cost: 2,
    ttl_hours: 4,
    instance_type: "t3.small",
    challenge_port: 0,
    challenge_path: "",
  },
];
