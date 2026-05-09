# MemoryGhost — Windows Memory Forensics

**Base image:** ghcr.io/volatilityfoundation/volatility3
**Category:** DFIR | **Difficulty:** Easy-Medium
**Port:** 3000 (health) / 22 (SSH)

## Before Building
Place the memory image at: `labs/dfir/evidence/MemoryDump_Lab1.raw`

## Attack Path
1. Connect via WireGuard
2. `ssh -p 2222 analyst@10.8.0.1` — password: `dfir2025!`
3. `vol windows.pslist` → `vol windows.cmdline` → `vol windows.filescan`
4. Find `FLAG{...}` inside the memory dump

## LabStack Config
| challenge_port | 3000      |
| challenge_path | /         |
| instance_type  | t3.small  |
