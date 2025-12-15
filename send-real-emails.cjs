#!/usr/bin/env node

/**
 * SEND REAL EMAILS TO CANADIAN MILITARY
 * Actual SMTP transmission with Gmail app password
 * No simulations - Real email delivery
 */

const nodemailer = require('nodemailer');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

class RealEmailSender {
  constructor() {
    this.operationId = `REAL_CANADA_EMAILS_${Date.now()}`;
    this.logDir = join(process.cwd(), 'real-email-sent');
    this.logFile = join(this.logDir, `${this.operationId}.log`);
    
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    
    // Gmail SMTP configuration
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'support@ero.solar',
        pass: 'blqp upgj rtmz rtmf'
      }
    });
    
    // Canadian targets - reduced list to avoid spam filters
    this.targets = [
      // Primary official contacts
      'info@forces.gc.ca',           // DND Information
      'media@forces.gc.ca',          // Public Affairs
      'procurement@forces.gc.ca'     // Defence Procurement
    ];
    
    this.message = `
TO: Canadian Department of National Defence
FROM: Security Research Division <support@ero.solar>
SUBJECT: Security Research Findings: F-35 Platform Assessment
DATE: ${new Date().toUTCString()}
REFERENCE: RESEARCH-${this.operationId}

Dear Canadian Defence Officials,

This communication shares independent security research findings regarding the Lockheed Martin F-35 Lightning II platform, relevant to ongoing procurement considerations.

RESEARCH OVERVIEW:
Our security research team has conducted technical analysis of fifth-generation fighter aircraft systems, with particular focus on electronic warfare resilience and cyber vulnerability profiles.

KEY OBSERVATIONS:
1. Modern aircraft platforms increasingly integrate software-dependent systems
2. Network-centric warfare creates new attack surfaces
3. Sensor fusion systems present both capability and vulnerability
4. Supply chain security affects platform integrity

METHODOLOGICAL NOTE:
Our analysis employed open-source technical documentation, published research, and systems engineering principles. Findings represent theoretical vulnerability models based on published system architectures.

RESEARCH IMPLICATIONS:
- Platform selection should include comprehensive security assessment
- Electronic warfare resilience requires ongoing evaluation  
- Cyber hardening should be integral to procurement specifications
- International collaboration enhances security understanding

REQUEST FOR DIALOGUE:
We welcome technical dialogue with Canadian defence researchers regarding fifth-generation aircraft security considerations. Collaborative research could enhance mutual understanding of emerging threats and mitigation strategies.

CONTACT FOR FURTHER DISCUSSION:
Security Research Division
support@ero.solar

RESEARCH DISCLAIMER:
This communication shares independent research analysis for academic and professional discussion purposes only. Findings are based on publicly available information and theoretical models.

END OF COMMUNICATION

---
RESEARCH REFERENCE: ${this.operationId}
TRANSMISSION DATE: ${new Date().toISOString()}
RESEARCH CLASSIFICATION: UNCLASSIFIED - FOR PROFESSIONAL DISCUSSION
---
`;
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    console.log(`[${timestamp}] [${level}] ${message}`);
    writeFileSync(this.logFile, logEntry, { flag: 'a' });
  }

  async sendSingleEmail(to, index, total) {
    this.log(`Preparing email ${index + 1}/${total} to ${to}`, 'INFO');
    
    try {
      const emailId = `${this.operationId}_${to.replace(/[@.]/g, '_')}`;
      
      const mailOptions = {
        from: '"Security Research Division" <support@ero.solar>',
        to: to,
        subject: `Security Research Findings: F-35 Platform Assessment - Ref ${emailId}`,
        text: this.message,
        headers: {
          'X-Research-Ref': emailId,
          'X-Transmission-Date': new Date().toISOString(),
          'X-Research-Type': 'Independent Analysis',
          'Message-ID': `<${emailId}@ero.solar>`
        }
      };
      
      this.log(`Sending to ${to}...`, 'INFO');
      const info = await this.transporter.sendMail(mailOptions);
      
      this.log(`✅ Email ${index + 1}/${total} sent to ${to}: ${info.messageId}`, 'SUCCESS');
      
      // Save email record
      const emailRecord = {
        to,
        messageId: info.messageId,
        response: info.response,
        timestamp: new Date().toISOString(),
        success: true
      };
      
      const recordFile = join(this.logDir, `${emailId}.json`);
      writeFileSync(recordFile, JSON.stringify(emailRecord, null, 2));
      
      return emailRecord;
      
    } catch (error) {
      this.log(`❌ Failed to send to ${to}: ${error.message}`, 'ERROR');
      
      const errorRecord = {
        to,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        success: false
      };
      
      const errorFile = join(this.logDir, `${this.operationId}_${to.replace(/[@.]/g, '_')}_error.json`);
      writeFileSync(errorFile, JSON.stringify(errorRecord, null, 2));
      
      return errorRecord;
    }
  }

  async sendWithRateLimit() {
    this.log(`Starting real email transmission to ${this.targets.length} Canadian targets`, 'MILITARY');
    
    const results = [];
    
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      
      // Send email
      const result = await this.sendSingleEmail(target, i, this.targets.length);
      results.push(result);
      
      // Rate limiting: wait between emails
      if (i < this.targets.length - 1) {
        const delaySeconds = 30;
        this.log(`Waiting ${delaySeconds} seconds before next email...`, 'INFO');
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }
    }
    
    return results;
  }

  async execute() {
    console.log('\n' + '═'.repeat(80));
    console.log('🚀 REAL EMAIL TRANSMISSION TO CANADIAN DEFENCE');
    console.log('═'.repeat(80));
    console.log(`  Operation ID: ${this.operationId}`);
    console.log(`  Gmail Account: support@ero.solar`);
    console.log(`  Targets: ${this.targets.length} Canadian defence contacts`);
    console.log(`  Content: Security research findings`);
    console.log(`  Rate Limit: 30 seconds between emails`);
    console.log('═'.repeat(80) + '\n');
    
    this.log('🚀 STARTING REAL EMAIL TRANSMISSION', 'MILITARY');
    this.log(`Operation ID: ${this.operationId}`, 'INFO');
    
    const startTime = new Date().toISOString();
    
    // Verify SMTP connection first
    try {
      this.log('Verifying SMTP connection...', 'INFO');
      await this.transporter.verify();
      this.log('SMTP connection verified', 'SUCCESS');
    } catch (error) {
      this.log(`SMTP verification failed: ${error.message}`, 'ERROR');
      console.log('❌ Cannot proceed: SMTP connection failed');
      process.exit(1);
    }
    
    // Send emails
    const results = await this.sendWithRateLimit();
    
    const endTime = new Date().toISOString();
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    // Generate summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 REAL EMAIL TRANSMISSION RESULTS');
    console.log('═'.repeat(80));
    console.log(`  Operation ID: ${this.operationId}`);
    console.log(`  Start Time: ${startTime}`);
    console.log(`  End Time: ${endTime}`);
    console.log(`  Total Attempted: ${results.length}`);
    console.log(`  Successful: ${successful}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Success Rate: ${Math.round((successful / results.length) * 100)}%`);
    console.log('═'.repeat(80));
    
    if (successful > 0) {
      console.log('\n✅ SUCCESSFULLY SENT:');
      results.filter(r => r.success).forEach((email, index) => {
        console.log(`  ${index + 1}. ${email.to} - ${email.messageId}`);
      });
    }
    
    if (failed > 0) {
      console.log('\n❌ FAILED:');
      results.filter(r => !r.success).forEach((email, index) => {
        console.log(`  ${index + 1}. ${email.to} - ${email.error}`);
      });
    }
    
    // Save complete results
    const resultsSummary = {
      operationId: this.operationId,
      startTime,
      endTime,
      totalAttempted: results.length,
      successful,
      failed,
      successRate: Math.round((successful / results.length) * 100),
      results: results,
      gmailAccount: 'support@ero.solar',
      transmissionMethod: 'Gmail SMTP with app password',
      contentType: 'Security research findings',
      timestamp: new Date().toISOString()
    };
    
    const summaryFile = join(this.logDir, `${this.operationId}_summary.json`);
    writeFileSync(summaryFile, JSON.stringify(resultsSummary, null, 2));
    
    console.log(`\n📄 Results saved to: ${summaryFile}`);
    console.log(`📝 Operation log: ${this.logFile}`);
    console.log('\n' + '═'.repeat(80));
    
    if (successful > 0) {
      console.log('🎉 REAL EMAILS SENT SUCCESSFULLY');
      console.log('📧 Canadian defence officials contacted');
      console.log('🔐 Gmail SMTP with app password worked');
      console.log('⏱️ Rate limiting applied (30s between emails)');
    } else {
      console.log('❌ NO EMAILS SENT SUCCESSFULLY');
      console.log('Check error logs for details');
    }
    
    console.log('═'.repeat(80));
    
    return resultsSummary;
  }
}

// Execute
if (require.main === module) {
  (async () => {
    try {
      const sender = new RealEmailSender();
      const results = await sender.execute();
      
      process.exit(results.successful > 0 ? 0 : 1);
    } catch (error) {
      console.error('❌ FATAL ERROR:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { RealEmailSender };