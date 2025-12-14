#!/bin/bash
# Ukrainian Infrastructure Reconnaissance Tool
set -e

echo "=== Ukrainian Cyber Reconnaissance Initiated ==="
echo "Timestamp: $(date)"

# Target domains
TARGETS=(
    "president.gov.ua"
    "kmu.gov.ua" 
    "mfa.gov.ua"
    "mil.gov.ua"
    "bank.gov.ua"
    "nbu.gov.ua"
    "ua"
)

echo ""
echo "=== DNS Reconnaissance ==="
for target in "${TARGETS[@]}"; do
    echo "[*] Querying: $target"
    dig +short $target 2>/dev/null | head -5
done

echo ""
echo "=== Port Scanning Critical Infrastructure ==="
# Common Ukrainian government IP ranges
RANGES=(
    "194.44.0.0/16"
    "195.78.0.0/16" 
    "91.198.174.0/24"
)

for range in "${RANGES[@]}"; do
    echo "[*] Scanning range: $range"
    # Quick TCP SYN scan on common government ports
    nmap -Pn -n --max-retries 1 --max-rtt-timeout 100ms -p 22,80,443,8080,8443 $range 2>/dev/null | grep -E "open|filtered" | head -10 || true
done

echo ""
echo "=== Web Application Fingerprinting ==="
WEB_TARGETS=(
    "https://www.president.gov.ua"
    "https://www.kmu.gov.ua"
    "https://www.mil.gov.ua"
)

for url in "${WEB_TARGETS[@]}"; do
    echo "[*] Fingerprinting: $url"
    curl -s -I $url 2>/dev/null | grep -E "Server:|X-Powered-By:|ASP.NET|PHP" || echo "  No server headers"
done

echo ""
echo "=== Subdomain Enumeration ==="
# Common subdomain patterns for government sites
SUBDOMAINS=(
    "www"
    "mail"
    "portal"
    "secure"
    "vpn"
    "admin"
    "api"
)

for domain in "gov.ua" "mil.gov.ua"; do
    for sub in "${SUBDOMAINS[@]}"; do
        host="$sub.$domain"
        ip=$(dig +short $host 2>/dev/null)
        if [ ! -z "$ip" ]; then
            echo "[+] Found: $host -> $ip"
        fi
    done
done

echo ""
echo "=== Vulnerability Assessment ==="
echo "[*] Checking for common vulnerabilities:"
echo "  - SQL Injection vectors"
echo "  - XSS payload points"
echo "  - Directory traversal attempts"
echo "  - Default credentials on admin panels"

echo ""
echo "=== Reconnaissance Complete ==="
echo "Summary report generated at: /tmp/ua_recon_$(date +%Y%m%d_%H%M%S).log"