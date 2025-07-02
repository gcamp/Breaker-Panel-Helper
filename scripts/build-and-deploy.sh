#!/bin/bash

# Build and Deploy Script for Breaker Panel Helper
# Usage: ./scripts/build-and-deploy.sh [version]

set -e

# Configuration
IMAGE_NAME="breaker-panel-helper"
VERSION=${1:-"latest"}
REGISTRY_URL=${REGISTRY_URL:-""}
UNRAID_HOST=${UNRAID_HOST:-""}
UNRAID_USER=${UNRAID_USER:-"root"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    log_info "Docker found: $(docker --version)"
}

# Build the Docker image
build_image() {
    log_info "Building Docker image: ${IMAGE_NAME}:${VERSION}"
    
    # Build the image
    docker build -t "${IMAGE_NAME}:${VERSION}" .
    
    # Also tag as latest if version is specified
    if [ "$VERSION" != "latest" ]; then
        docker tag "${IMAGE_NAME}:${VERSION}" "${IMAGE_NAME}:latest"
        log_info "Tagged as ${IMAGE_NAME}:latest"
    fi
    
    log_info "Build completed successfully"
}

# Push to registry (optional)
push_image() {
    if [ -n "$REGISTRY_URL" ]; then
        log_info "Pushing to registry: $REGISTRY_URL"
        
        # Tag for registry
        docker tag "${IMAGE_NAME}:${VERSION}" "${REGISTRY_URL}/${IMAGE_NAME}:${VERSION}"
        docker tag "${IMAGE_NAME}:latest" "${REGISTRY_URL}/${IMAGE_NAME}:latest"
        
        # Push to registry
        docker push "${REGISTRY_URL}/${IMAGE_NAME}:${VERSION}"
        docker push "${REGISTRY_URL}/${IMAGE_NAME}:latest"
        
        log_info "Push completed successfully"
    else
        log_warn "No registry URL specified, skipping push"
    fi
}

# Deploy to Unraid (optional)
deploy_to_unraid() {
    if [ -n "$UNRAID_HOST" ]; then
        log_info "Deploying to Unraid server: $UNRAID_HOST"
        
        # Create deployment script
        cat > /tmp/unraid-deploy.sh << EOF
#!/bin/bash

# Stop existing container if running
if docker ps -q -f name=breaker-panel-helper | grep -q .; then
    echo "Stopping existing container..."
    docker stop breaker-panel-helper
    docker rm breaker-panel-helper
fi

# Create directories if they don't exist
mkdir -p /mnt/user/appdata/breaker-panel-helper/data
mkdir -p /mnt/user/appdata/breaker-panel-helper/csv-imports
chown -R 1001:1001 /mnt/user/appdata/breaker-panel-helper

# Run the new container
docker run -d \\
  --name breaker-panel-helper \\
  --restart unless-stopped \\
  -p 3000:3000 \\
  -v /mnt/user/appdata/breaker-panel-helper/data:/app/data \\
  -v /mnt/user/appdata/breaker-panel-helper/csv-imports:/app/csv-imports:ro \\
  -e NODE_ENV=production \\
  -e TZ=America/New_York \\
  ${REGISTRY_URL:+${REGISTRY_URL}/}${IMAGE_NAME}:${VERSION}

echo "Container started successfully"
docker ps | grep breaker-panel-helper
EOF

        # Copy and execute deployment script
        scp /tmp/unraid-deploy.sh "${UNRAID_USER}@${UNRAID_HOST}:/tmp/"
        ssh "${UNRAID_USER}@${UNRAID_HOST}" "chmod +x /tmp/unraid-deploy.sh && /tmp/unraid-deploy.sh"
        
        # Cleanup
        rm /tmp/unraid-deploy.sh
        
        log_info "Deployment to Unraid completed"
    else
        log_warn "No Unraid host specified, skipping deployment"
    fi
}

# Test the deployment
test_deployment() {
    log_info "Testing deployment..."
    
    # Wait a moment for container to start
    sleep 5
    
    # Test locally if no Unraid host specified
    if [ -z "$UNRAID_HOST" ]; then
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
            log_info "Local deployment test passed"
        else
            log_error "Local deployment test failed"
            return 1
        fi
    else
        # Test remote deployment
        if curl -s -o /dev/null -w "%{http_code}" "http://${UNRAID_HOST}:3000" | grep -q "200"; then
            log_info "Remote deployment test passed"
        else
            log_error "Remote deployment test failed"
            return 1
        fi
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [version]"
    echo ""
    echo "Environment variables:"
    echo "  REGISTRY_URL   - Docker registry URL (optional)"
    echo "  UNRAID_HOST    - Unraid server hostname/IP (optional)"
    echo "  UNRAID_USER    - SSH user for Unraid (default: root)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Build with 'latest' tag"
    echo "  $0 v1.0.0                    # Build with specific version"
    echo "  REGISTRY_URL=registry.local $0 v1.0.0  # Build and push to registry"
    echo "  UNRAID_HOST=192.168.1.100 $0 v1.0.0    # Build and deploy to Unraid"
}

# Main execution
main() {
    log_info "Starting build and deployment process..."
    log_info "Version: $VERSION"
    
    # Check prerequisites
    check_docker
    
    # Build image
    build_image
    
    # Push to registry if configured
    push_image
    
    # Deploy to Unraid if configured
    deploy_to_unraid
    
    # Test deployment
    test_deployment
    
    log_info "Build and deployment process completed successfully!"
    
    # Show access information
    if [ -n "$UNRAID_HOST" ]; then
        echo ""
        log_info "Access your application at: http://${UNRAID_HOST}:3000"
    else
        echo ""
        log_info "Access your application at: http://localhost:3000"
    fi
}

# Handle help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

# Run main function
main