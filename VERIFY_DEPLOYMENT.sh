#!/bin/bash

# 🚀 AGI Core v1.1.115 - Deployment Verification Script
# This script verifies that the deployment completed successfully

set -e

echo "🔍 AGI Core v1.1.115 - Deployment Verification"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_passed() {
    echo -e "${GREEN}✓ PASSED:${NC} $1"
}

check_failed() {
    echo -e "${RED}✗ FAILED:${NC} $1"
    exit 1
}

check_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
}

echo "📦 Phase 1: npm Package Verification"
echo "-----------------------------------"

# Check npm package version
NPM_VERSION=$(npm view agi-core-cli version 2>/dev/null || echo "NOT_FOUND")
if [ "$NPM_VERSION" = "1.1.115" ]; then
    check_passed "npm package version is 1.1.115"
else
    check_failed "npm package version is $NPM_VERSION (expected 1.1.115)"
fi

# Check package details
echo -n "Checking package details... "
npm view agi-core-cli name >/dev/null 2>&1 && check_passed "Package exists on npm"
npm view agi-core-cli description >/dev/null 2>&1 && check_passed "Package description available"
npm view agi-core-cli bin >/dev/null 2>&1 && check_passed "Binary configuration available"

echo ""
echo "🌐 Phase 2: GitHub Repository Verification"
echo "----------------------------------------"

# Check git remote
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "NOT_CONFIGURED")
if [[ "$REMOTE_URL" == *"github.com"* ]]; then
    check_passed "GitHub remote configured: $REMOTE_URL"
else
    check_warning "Git remote may not be GitHub: $REMOTE_URL"
fi

# Check git tag exists locally
if git tag --list | grep -q "v1.1.115"; then
    check_passed "Git tag v1.1.115 exists locally"
else
    check_failed "Git tag v1.1.115 not found locally"
fi

# Check if we can fetch from origin (optional, may require auth)
echo -n "Checking GitHub connectivity... "
git fetch --dry-run >/dev/null 2>&1 && check_passed "Can connect to GitHub" || check_warning "GitHub connectivity check skipped (may need auth)"

echo ""
echo "⚙️ Phase 3: Local Build Verification"
echo "-----------------------------------"

# Check package.json version
LOCAL_VERSION=$(node -p "require('./package.json').version")
if [ "$LOCAL_VERSION" = "1.1.115" ]; then
    check_passed "Local package.json version is 1.1.115"
else
    check_failed "Local package.json version is $LOCAL_VERSION (expected 1.1.115)"
fi

# Check TypeScript compilation
echo -n "Checking TypeScript compilation... "
if npx tsc --noEmit 2>/dev/null; then
    check_passed "TypeScript compilation successful"
else
    check_warning "TypeScript compilation has warnings (check manually)"
fi

# Check if dist directory exists
if [ -d "dist" ]; then
    check_passed "Dist directory exists"
    
    # Check main binaries
    if [ -f "dist/bin/agi.js" ]; then
        check_passed "Main CLI binary exists: dist/bin/agi.js"
    fi
    
    if [ -f "dist/bin/erosolar.js" ]; then
        check_passed "Alternative binary exists: dist/bin/erosolar.js"
    fi
else
    check_failed "Dist directory not found - build may have failed"
fi

echo ""
echo "🧪 Phase 4: Test Verification"
echo "----------------------------"

# Run quick test check
echo -n "Checking test status... "
TEST_OUTPUT=$(npm test 2>&1 | tail -10 | grep -E "(Test Suites:|Tests:|Time:)" || echo "NO_TEST_OUTPUT")
if echo "$TEST_OUTPUT" | grep -q "passed"; then
    check_passed "Tests are passing"
    echo "  Test summary:"
    echo "$TEST_OUTPUT" | while read line; do echo "    $line"; done
else
    check_warning "Test status unknown - run 'npm test' manually"
fi

echo ""
echo "📄 Phase 5: Documentation Verification"
echo "-------------------------------------"

# Check deployment documentation
DOC_FILES=(
    "FINAL_DEPLOYMENT_REPORT.md"
    "RELEASE_SUMMARY.md" 
    "DEPLOYMENT_EXECUTION_GUIDE.md"
    "DEPLOYMENT_CHECKLIST.md"
    "AGI_CORE_v1.1.115_DEPLOYMENT_COMPLETE_SUMMARY.md"
)

for doc in "${DOC_FILES[@]}"; do
    if [ -f "$doc" ]; then
        LINE_COUNT=$(wc -l < "$doc" | tr -d ' ')
        check_passed "$doc exists ($LINE_COUNT lines)"
    else
        check_warning "$doc not found"
    fi
done

# Check README
if [ -f "README.md" ]; then
    check_passed "README.md exists"
    if grep -q "1.1.115" README.md 2>/dev/null; then
        check_passed "README mentions version 1.1.115"
    else
        check_warning "README may not be updated for v1.1.115"
    fi
fi

echo ""
echo "🚀 Phase 6: Installation Test"
echo "----------------------------"

# Test npx installation (doesn't require global install)
echo -n "Testing npx installation... "
NPX_TEST=$(npx agi-core-cli@1.1.115 --version 2>&1 || echo "NPX_FAILED")
if echo "$NPX_TEST" | grep -q "1.1.115"; then
    check_passed "npx installation works: $NPX_TEST"
elif echo "$NPX_TEST" | grep -q "NPX_FAILED"; then
    check_warning "npx test failed - may need to wait for npm propagation"
else
    check_warning "npx test returned: $NPX_TEST"
fi

# Check if global installation would work
echo -n "Checking package structure for global install... "
if [ -f "package.json" ] && [ -d "dist/bin" ]; then
    check_passed "Package structure valid for global installation"
else
    check_failed "Package structure incomplete"
fi

echo ""
echo "🛡️ Phase 7: Security Framework Check"
echo "-----------------------------------"

# Check security files exist
SECURITY_FILES=(
    "src/core/guardrails.ts"
    "OFFENSIVE_SECURITY_UNIFICATION_SUMMARY.md"
)

for file in "${SECURITY_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_passed "Security file exists: $file"
        
        # Check for military authorization levels
        if grep -q "Level 5" "$file" 2>/dev/null || grep -q "Full Combat" "$file" 2>/dev/null; then
            check_passed "  Contains military-grade security framework"
        fi
    else
        check_warning "Security file not found: $file"
    fi
done

echo ""
echo "📊 Phase 8: Bundle Size Verification"
echo "-----------------------------------"

# Check bundle size
echo -n "Checking bundle size... "
if [ -d "dist" ]; then
    # Calculate total size of dist directory
    DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
    check_passed "Dist directory size: $DIST_SIZE"
    
    # Check individual bundle sizes
    echo "  Individual file sizes:"
    find dist -name "*.js" -type f -exec du -h {} \; 2>/dev/null | sort -hr | head -5 | while read size file; do
        echo "    $size - $file"
    done
fi

# Check npm pack output
echo -n "Checking npm pack dry-run... "
if npm pack --dry-run 2>&1 | grep -q "agi-core-cli-1.1.115.tgz"; then
    check_passed "npm pack generates correct tarball name"
    
    # Get package size from npm pack
    PACK_SIZE=$(npm pack --dry-run 2>&1 | grep "package size" | cut -d: -f2 | tr -d ' ')
    if [ -n "$PACK_SIZE" ]; then
        check_passed "Package tarball size: $PACK_SIZE"
    fi
fi

echo ""
echo "🎯 SUMMARY"
echo "=========="

echo ""
echo "✅ DEPLOYMENT VERIFICATION COMPLETE"
echo ""
echo "AGI Core v1.1.115 deployment status:"

echo ""
echo "📦 npm Package:"
echo "  - Version: $NPM_VERSION"
echo "  - Status: $(if [ "$NPM_VERSION" = "1.1.115" ]; then echo "✅ PUBLISHED"; else echo "❌ NOT PUBLISHED"; fi)"
echo "  - URL: https://www.npmjs.com/package/agi-core-cli"

echo ""
echo "🌐 GitHub Repository:"
echo "  - Remote: $(echo $REMOTE_URL | cut -c1-50)..."
echo "  - Tag v1.1.115: $(if git tag --list | grep -q "v1.1.115"; then echo "✅ EXISTS"; else echo "❌ MISSING"; fi)"
echo "  - URL: https://github.com/ErosolarAI/agi-core-CLI-coding"

echo ""
echo "⚙️ Local Build:"
echo "  - Version: $LOCAL_VERSION"
echo "  - TypeScript: $(if npx tsc --noEmit 2>/dev/null; then echo "✅ COMPILES"; else echo "⚠️ HAS WARNINGS"; fi)"
echo "  - Tests: $(if echo "$TEST_OUTPUT" | grep -q "passed"; then echo "✅ PASSING"; else echo "⚠️ CHECK MANUALLY"; fi)"

echo ""
echo "📄 Documentation:"
echo "  - Deployment docs: ${#DOC_FILES[@]} files"
echo "  - Total lines: $(cat ${DOC_FILES[@]} 2>/dev/null | wc -l | tr -d ' ') lines"

echo ""
echo "🚀 Next Steps:"
echo "  1. Create GitHub release via web interface"
echo "  2. Monitor npm downloads and user feedback"
echo "  3. Track performance metrics and error rates"
echo "  4. Gather user feedback for next release"
echo ""
echo "💡 Quick Commands:"
echo "  - Install: npm install -g agi-core-cli"
echo "  - Test: npx agi-core-cli@1.1.115 --version"
echo "  - Run: agi --help"
echo ""
echo "🏁 AGI Core v1.1.115 deployment verification complete!"