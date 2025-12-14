# AGI Core Security Fixes Implementation Plan

## Phase 1: Critical Command Injection Fixes

### 1.1 Secure Command Execution Wrapper
Create a secure wrapper for execSync that:
- Validates all input parameters
- Escapes shell metacharacters
- Implements resource limits
- Logs all executions

### 1.2 Input Validation Functions
Add comprehensive validation:
- Target validation (IP/hostname format)
- Port validation (1-65535)
- URL validation (safe schemes only)
- File path validation (no traversal)

### 1.3 Safe Default Timeouts
Replace 24-hour timeouts with:
- 5 minutes for network scans
- 1 minute for HTTP requests
- 30 seconds for command execution

## Phase 2: Network Security Controls

### 2.1 Network Scope Restrictions
- Allow only user-specified targets
- Block internal IP ranges (RFC 1918)
- Prevent SSRF attacks
- Rate limit network requests

### 2.2 Resource Limits
- Max output size: 10MB
- Max concurrent processes: 5
- Max memory per process: 512MB
- Max CPU time: 60 seconds

## Phase 3: UI Security Hardening

### 3.1 Input Size Limits
- Max paste size: 10MB
- Max buffer size: 1MB
- Max line length: 1000 chars
- Rate limit user input

### 3.2 Escape Sequence Sanitization
- Strip all ANSI escape sequences
- Validate UTF-8 encoding
- Prevent terminal injection
- Sanitize file paths

## Implementation Priority

### Day 1 (Critical)
1. Secure execSync wrapper
2. Input validation functions
3. Timeout reduction
4. Command logging

### Day 2 (High)
5. Network scope restrictions
6. Resource limits
7. Output size limits
8. Error sanitization

### Day 3 (Medium)
9. UI input limits
10. Audit logging
11. Security configuration
12. Rate limiting

## Files to Modify

### High Priority
1. src/tools/taoTools.ts - Complete security overhaul
2. src/tools/bashTools.ts - Add security wrappers
3. src/core/errors/safetyValidator.ts - Enhance validation

### Medium Priority
4. src/ui/UnifiedUIRenderer.ts - Add input limits
5. src/headless/interactiveShell.ts - Add security controls
6. src/core/toolRuntime.ts - Add security hooks

### Low Priority
7. All other tool files - Apply security patterns

## Testing Strategy

1. Command injection test suite
2. Resource exhaustion tests
3. Memory limit tests
4. Network scope tests
5. Input validation tests

## Rollout Plan

1. Create security branch
2. Implement fixes in isolation
3. Test thoroughly
4. Merge to main
5. Monitor for issues
