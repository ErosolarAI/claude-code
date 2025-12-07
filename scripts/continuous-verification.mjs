#!/usr/bin/env node

/**
 * Continuous Verification System
 * 
 * Implements continuous verification that can be integrated into:
 * 1. CI/CD pipelines
 * 2. Pre-commit hooks
 * 3. Development workflows
 * 4. Monitoring systems
 * 
 * Provides:
 * - Real-time verification feedback
 * - Trend analysis
 * - Automated issue detection
 * - Verification result persistence
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import { spawnSync } from 'child_process';

class ContinuousVerification {
  constructor() {
    this.resultsHistory = [];
    this.metrics = {
      verificationRuns: 0,
      successRate: 0,
      averageDuration: 0,
      commonFailures: []
    };
  }

  /**
   * Run verification and track results
   */
  async runVerification() {
    const startTime = Date.now();
    
    console.log('🔄 Running Continuous Verification...\n');

    const verificationResults = {
      timestamp: new Date().toISOString(),
      technical: this.runQuickTechnicalCheck(),
      quality: this.runQuickQualityCheck(),
      security: this.runQuickSecurityCheck(),
      performance: this.runQuickPerformanceCheck()
    };

    const duration = Date.now() - startTime;
    verificationResults.duration = duration;

    // Calculate overall status
    verificationResults.overallStatus = this.calculateOverallStatus(verificationResults);

    // Store results
    this.storeResults(verificationResults);
    this.updateMetrics(verificationResults);

    return verificationResults;
  }

  /**
   * Quick technical validation
   */
  runQuickTechnicalCheck() {
    try {
      const typeCheck = spawnSync('npm', ['run', 'type-check'], {
        shell: true,
        encoding: 'utf8',
        timeout: 30000
      });

      return {
        passed: typeCheck.status === 0,
        details: typeCheck.status === 0 ? 'TypeScript compilation successful' : 'TypeScript compilation failed'
      };
    } catch (error) {
      return {
        passed: false,
        details: `Technical check error: ${error.message}`
      };
    }
  }

  /**
   * Quick quality check
   */
  runQuickQualityCheck() {
    try {
      const lintCheck = spawnSync('npm', ['run', 'lint'], {
        shell: true,
        encoding: 'utf8',
        timeout: 30000
      });

      return {
        passed: lintCheck.status === 0,
        details: lintCheck.status === 0 ? 'Linting passed' : 'Linting issues found'
      };
    } catch (error) {
      return {
        passed: false,
        details: `Quality check error: ${error.message}`
      };
    }
  }

  /**
   * Quick security check
   */
  runQuickSecurityCheck() {
    try {
      // Check for critical security files
      const securityFiles = [
        'src/core/errors/safetyValidator.ts',
        'src/core/resultVerification.ts'
      ];

      const missingFiles = securityFiles.filter(file => !existsSync(file));

      return {
        passed: missingFiles.length === 0,
        details: missingFiles.length === 0 ? 
          'Security framework present' : 
          `Missing security files: ${missingFiles.join(', ')}`
      };
    } catch (error) {
      return {
        passed: false,
        details: `Security check error: ${error.message}`
      };
    }
  }

  /**
   * Quick performance check
   */
  runQuickPerformanceCheck() {
    try {
      const buildStart = Date.now();
      const buildCheck = spawnSync('npm', ['run', 'build'], {
        shell: true,
        encoding: 'utf8',
        timeout: 60000
      });
      const buildDuration = Date.now() - buildStart;

      return {
        passed: buildCheck.status === 0,
        details: buildCheck.status === 0 ? 
          `Build successful (${buildDuration}ms)` : 
          'Build failed',
        duration: buildDuration
      };
    } catch (error) {
      return {
        passed: false,
        details: `Performance check error: ${error.message}`
      };
    }
  }

  /**
   * Calculate overall verification status
   */
  calculateOverallStatus(results) {
    const checks = [results.technical, results.quality, results.security, results.performance];
    const passedChecks = checks.filter(check => check.passed).length;
    
    if (passedChecks === checks.length) return 'SUCCESS';
    if (passedChecks >= checks.length * 0.75) return 'WARNING';
    return 'FAILED';
  }

  /**
   * Store verification results
   */
  storeResults(results) {
    this.resultsHistory.push(results);
    
    // Keep only last 100 results
    if (this.resultsHistory.length > 100) {
      this.resultsHistory = this.resultsHistory.slice(-100);
    }

    // Append to log file
    const logEntry = `${results.timestamp} | ${results.overallStatus} | ${results.duration}ms\n`;
    appendFileSync('verification-history.log', logEntry, 'utf8');
  }

  /**
   * Update metrics based on results
   */
  updateMetrics(results) {
    this.metrics.verificationRuns++;
    
    // Calculate success rate
    const successfulRuns = this.resultsHistory.filter(r => r.overallStatus === 'SUCCESS').length;
    this.metrics.successRate = (successfulRuns / this.resultsHistory.length) * 100;
    
    // Calculate average duration
    const totalDuration = this.resultsHistory.reduce((sum, r) => sum + r.duration, 0);
    this.metrics.averageDuration = totalDuration / this.resultsHistory.length;
    
    // Track common failures
    const failedChecks = [];
    if (!results.technical.passed) failedChecks.push('Technical');
    if (!results.quality.passed) failedChecks.push('Quality');
    if (!results.security.passed) failedChecks.push('Security');
    if (!results.performance.passed) failedChecks.push('Performance');
    
    if (failedChecks.length > 0) {
      this.metrics.commonFailures = [...new Set([...this.metrics.commonFailures, ...failedChecks])];
    }
  }

  /**
   * Generate verification report
   */
  generateReport(results) {
    console.log('\n📊 CONTINUOUS VERIFICATION REPORT');
    console.log('================================\n');

    console.log(`Overall Status: ${results.overallStatus === 'SUCCESS' ? '✅ SUCCESS' : 
      results.overallStatus === 'WARNING' ? '⚠️ WARNING' : '❌ FAILED'}`);
    console.log(`Duration: ${results.duration}ms\n`);

    console.log('Detailed Results:');
    console.log(`  Technical: ${results.technical.passed ? '✅' : '❌'} ${results.technical.details}`);
    console.log(`  Quality: ${results.quality.passed ? '✅' : '❌'} ${results.quality.details}`);
    console.log(`  Security: ${results.security.passed ? '✅' : '❌'} ${results.security.details}`);
    console.log(`  Performance: ${results.performance.passed ? '✅' : '❌'} ${results.performance.details}`);

    console.log('\n📈 Verification Metrics:');
    console.log(`  Total Runs: ${this.metrics.verificationRuns}`);
    console.log(`  Success Rate: ${this.metrics.successRate.toFixed(1)}%`);
    console.log(`  Average Duration: ${this.metrics.averageDuration.toFixed(0)}ms`);
    
    if (this.metrics.commonFailures.length > 0) {
      console.log(`  Common Failures: ${this.metrics.commonFailures.join(', ')}`);
    }

    console.log('\n🎯 Recommendations:');
    if (results.overallStatus === 'SUCCESS') {
      console.log('  ✅ All verification checks passed');
      console.log('  ✅ Ready for deployment');
    } else {
      console.log('  🔧 Address failed verification checks');
      console.log('  🔧 Review detailed results above');
      console.log('  🔧 Consider running full verification for deeper analysis');
    }

    return {
      results,
      metrics: this.metrics
    };
  }

  /**
   * Main verification workflow
   */
  async verify() {
    const results = await this.runVerification();
    return this.generateReport(results);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new ContinuousVerification();
  
  verifier.verify()
    .then(report => {
      console.log('\n🎉 Continuous verification complete!');
      process.exit(report.results.overallStatus === 'SUCCESS' ? 0 : 1);
    })
    .catch(error => {
      console.error('Continuous verification failed:', error);
      process.exit(1);
    });
}

export { ContinuousVerification };