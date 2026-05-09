# NetworkNinja — Command Injection

**Base image:** ghcr.io/digininja/dvwa
**Category:** Networking | **Difficulty:** Easy-Medium
**Port:** 80 | **Path:** /login.php

## Story
A poorly configured internal web application is exposed on the network.
The flag is on the server. Find a way to read it.

## Attack Path
1. Open `http://10.8.0.1` after WireGuard connect
2. Login: `admin / password`
3. Set DVWA Security to Low
4. Go to Command Injection
5. Inject: `; cat /var/www/html/flag.txt`

## LabStack Config
| challenge_port | 80        |
| challenge_path | /login.php |
| instance_type  | t3.small  |
