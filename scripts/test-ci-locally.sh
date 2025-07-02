#!/bin/bash

# Local CI Testing Script
# Tests the same steps that run in GitHub Actions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        exit 1
    fi
    log_info "Node.js: $(node --version)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is required but not installed"
        exit 1
    fi
    log_info "npm: $(npm --version)"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found - skipping Docker tests"
        SKIP_DOCKER=true
    else
        log_info "Docker: $(docker --version)"
        SKIP_DOCKER=false
    fi
}

# Install dependencies
install_dependencies() {
    log_step "Installing dependencies..."
    npm ci
    log_info "Dependencies installed successfully"
}

# Run linting
run_lint() {
    log_step "Running linter..."
    if npm run lint --if-present; then
        log_info "Linting passed"
    else
        log_error "Linting failed"
        return 1
    fi
}

# Run tests
run_tests() {
    log_step "Running tests..."
    
    # Run unit tests
    if npm test --if-present; then
        log_info "Tests passed"
    else
        log_error "Tests failed"
        return 1
    fi
    
    # Run feature validation
    if [ -f "validate-features.js" ]; then
        log_step "Running feature validation..."
        if node validate-features.js; then
            log_info "Feature validation passed"
        else
            log_error "Feature validation failed"
            return 1
        fi
    fi
}

# Test server startup
test_server() {
    log_step "Testing server startup..."
    
    # Start server in background
    npm start &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 5
    
    # Test health endpoint
    if curl -f http://localhost:3000 >/dev/null 2>&1; then
        log_info "Server started successfully"
        SERVER_TEST_PASSED=true
    else
        log_error "Server failed to start or respond"
        SERVER_TEST_PASSED=false
    fi
    
    # Stop server
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    
    if [ "$SERVER_TEST_PASSED" = false ]; then
        return 1
    fi
}

# Test Docker build
test_docker() {
    if [ "$SKIP_DOCKER" = true ]; then
        log_warn "Skipping Docker tests - Docker not available"
        return 0
    fi
    
    log_step "Testing Docker build..."
    
    # Build image
    if docker build -t breaker-panel-helper:test .; then
        log_info "Docker build successful"
    else
        log_error "Docker build failed"
        return 1
    fi
    
    # Test container
    log_step "Testing Docker container..."
    
    # Start container
    docker run --rm -d --name test-container \
        -p 3001:3000 \
        -e NODE_ENV=production \
        breaker-panel-helper:test
    
    # Wait for container to start
    sleep 10
    
    # Test health
    if curl -f http://localhost:3001 >/dev/null 2>&1; then
        log_info "Docker container test passed"
        DOCKER_TEST_PASSED=true
    else
        log_error "Docker container test failed"
        DOCKER_TEST_PASSED=false
    fi
    
    # Check logs for errors
    if docker logs test-container 2>&1 | grep -i error; then
        log_warn "Found errors in container logs"
    fi
    
    # Cleanup
    docker stop test-container >/dev/null 2>&1 || true
    
    if [ "$DOCKER_TEST_PASSED" = false ]; then
        return 1
    fi
}

# Security checks
run_security_checks() {
    log_step "Running security checks..."
    
    # npm audit
    if npm audit --audit-level=high; then
        log_info "No high severity vulnerabilities found"
    else
        log_warn "High severity vulnerabilities found - check npm audit output"
    fi
    
    # Basic secret detection
    log_step "Checking for potential secrets..."
    if grep -r -i "password\|secret\|key\|token" --include="*.js" --include="*.json" . | grep -v "node_modules" | grep -v "test" | grep -v "example"; then
        log_warn "Found potential secrets - please review"
    else
        log_info "No obvious secrets found"
    fi
}

# Generate summary
generate_summary() {
    echo ""
    echo "=========================================="
    log_info "Local CI Test Summary"
    echo "=========================================="
    echo ""
    
    echo "✅ Prerequisites: PASSED"
    echo "✅ Dependencies: PASSED"
    
    if [ "$LINT_PASSED" = true ]; then
        echo "✅ Linting: PASSED"
    else
        echo "❌ Linting: FAILED"
    fi
    
    if [ "$TESTS_PASSED" = true ]; then
        echo "✅ Tests: PASSED"
    else
        echo "❌ Tests: FAILED"
    fi
    
    if [ "$SERVER_PASSED" = true ]; then
        echo "✅ Server: PASSED"
    else
        echo "❌ Server: FAILED"
    fi
    
    if [ "$SKIP_DOCKER" = true ]; then
        echo "⚠️  Docker: SKIPPED"
    elif [ "$DOCKER_PASSED" = true ]; then
        echo "✅ Docker: PASSED"
    else
        echo "❌ Docker: FAILED"
    fi
    
    echo "✅ Security: COMPLETED"
    echo ""
    
    if [ "$OVERALL_PASSED" = true ]; then
        log_info "All tests passed! Ready for CI/CD pipeline"
    else
        log_error "Some tests failed - please fix before pushing"
        exit 1
    fi
}

# Main execution
main() {
    echo "=========================================="
    log_info "Local CI Testing for Breaker Panel Helper"
    echo "=========================================="
    echo ""
    
    OVERALL_PASSED=true
    
    # Run all checks
    check_prerequisites
    install_dependencies
    
    if run_lint; then
        LINT_PASSED=true
    else
        LINT_PASSED=false
        OVERALL_PASSED=false
    fi
    
    if run_tests; then
        TESTS_PASSED=true
    else
        TESTS_PASSED=false
        OVERALL_PASSED=false
    fi
    
    if test_server; then
        SERVER_PASSED=true
    else
        SERVER_PASSED=false
        OVERALL_PASSED=false
    fi
    
    if test_docker; then
        DOCKER_PASSED=true
    else
        DOCKER_PASSED=false
        OVERALL_PASSED=false
    fi
    
    run_security_checks
    
    generate_summary
}

# Handle help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [options]"
    echo ""
    echo "This script runs the same tests that execute in GitHub Actions CI/CD pipeline."
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    echo ""
    echo "Tests performed:"
    echo "  1. Dependency installation"
    echo "  2. Linting"
    echo "  3. Unit tests"
    echo "  4. Feature validation"
    echo "  5. Server startup"
    echo "  6. Docker build and run (if Docker available)"
    echo "  7. Security checks"
    exit 0
fi

# Run main function
main