#!/bin/bash

# Unraid Installation Script for Breaker Panel Helper
# Run this script on your Unraid server to set up the application

set -e

# Configuration
APP_NAME="breaker-panel-helper"
IMAGE_NAME="breaker-panel-helper:latest"
CONTAINER_NAME="breaker-panel-helper"
HOST_PORT="3000"
CONTAINER_PORT="3000"

# Unraid paths
APPDATA_PATH="/mnt/user/appdata/${APP_NAME}"
DATA_PATH="${APPDATA_PATH}/data"
CSV_PATH="${APPDATA_PATH}/csv-imports"
TEMPLATE_PATH="/boot/config/plugins/dockerMan/templates-user"

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

# Check if running on Unraid
check_unraid() {
    if [ ! -d "/mnt/user" ]; then
        log_error "This script should be run on an Unraid server"
        exit 1
    fi
    log_info "Unraid environment detected"
}

# Create necessary directories
create_directories() {
    log_step "Creating application directories..."
    
    # Create main directories
    mkdir -p "$DATA_PATH"
    mkdir -p "$CSV_PATH"
    mkdir -p "$TEMPLATE_PATH"
    
    # Set proper ownership (container runs as UID 1001)
    chown -R 1001:1001 "$APPDATA_PATH"
    
    log_info "Directories created:"
    log_info "  Data: $DATA_PATH"
    log_info "  CSV Imports: $CSV_PATH"
}

# Stop existing container if running
stop_existing() {
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        log_step "Stopping existing container..."
        docker stop "$CONTAINER_NAME"
        docker rm "$CONTAINER_NAME"
        log_info "Existing container removed"
    fi
}

# Install Unraid template
install_template() {
    log_step "Installing Unraid template..."
    
    # Create the template file
    cat > "${TEMPLATE_PATH}/${APP_NAME}.xml" << 'EOF'
<?xml version="1.0"?>
<Container version="2">
  <Name>Breaker-Panel-Helper</Name>
  <Repository>breaker-panel-helper:latest</Repository>
  <Registry/>
  <Network>bridge</Network>
  <MyIP/>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support>https://github.com/your-username/breaker-panel-helper</Support>
  <Project>https://github.com/your-username/breaker-panel-helper</Project>
  <Overview>Comprehensive electrical panel breaker management system with French localization and advanced circuit tracking.</Overview>
  <Category>Tools: Utilities</Category>
  <WebUI>http://[IP]:[PORT:3000]</WebUI>
  <TemplateURL/>
  <Icon>https://raw.githubusercontent.com/selfhosters/unRAID-CA-templates/master/templates/img/database.png</Icon>
  <ExtraParams>--restart=unless-stopped</ExtraParams>
  <PostArgs/>
  <CPUset/>
  <DateInstalled/>
  <DonateText/>
  <DonateLink/>
  <Description>
    Breaker Panel Helper is a comprehensive electrical panel management application that allows you to:
    &#xD;
    - Track and manage electrical breakers across multiple panels
    - Support for single, double-pole, and tandem breakers
    - Circuit management with room assignments and detailed notes
    - Critical breaker planning and move operations
    - French/English localization
    - Visual panel layout with drag-and-drop room management
    - Export and print functionality
    &#xD;
    Perfect for electricians, homeowners, and facilities managers.
  </Description>
  <Networking>
    <Mode>bridge</Mode>
    <Publish>
      <Port>
        <HostPort>3000</HostPort>
        <ContainerPort>3000</ContainerPort>
        <Protocol>tcp</Protocol>
      </Port>
    </Publish>
  </Networking>
  <Data>
    <Volume>
      <HostDir>/mnt/user/appdata/breaker-panel-helper/data</HostDir>
      <ContainerDir>/app/data</ContainerDir>
      <Mode>rw</Mode>
    </Volume>
    <Volume>
      <HostDir>/mnt/user/appdata/breaker-panel-helper/csv-imports</HostDir>
      <ContainerDir>/app/csv-imports</ContainerDir>
      <Mode>ro</Mode>
    </Volume>
  </Data>
  <Environment>
    <Variable>
      <Value>production</Value>
      <Name>NODE_ENV</Name>
      <Mode/>
    </Variable>
    <Variable>
      <Value>/app/data/breaker_panel.db</Value>
      <Name>DB_PATH</Name>
      <Mode/>
    </Variable>
    <Variable>
      <Value>3000</Value>
      <Name>PORT</Name>
      <Mode/>
    </Variable>
    <Variable>
      <Value>America/New_York</Value>
      <Name>TZ</Name>
      <Mode/>
    </Variable>
  </Environment>
  <Labels/>
  <Config Name="WebUI Port" Target="3000" Default="3000" Mode="tcp" Description="Port for web interface" Type="Port" Display="always" Required="true" Mask="false">3000</Config>
  <Config Name="Database Storage" Target="/app/data" Default="/mnt/user/appdata/breaker-panel-helper/data" Mode="rw" Description="Persistent storage for SQLite database" Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/breaker-panel-helper/data</Config>
  <Config Name="CSV Imports" Target="/app/csv-imports" Default="/mnt/user/appdata/breaker-panel-helper/csv-imports" Mode="ro" Description="Optional directory for CSV import files" Type="Path" Display="always" Required="false" Mask="false">/mnt/user/appdata/breaker-panel-helper/csv-imports</Config>
  <Config Name="Timezone" Target="TZ" Default="America/New_York" Mode="" Description="Container timezone" Type="Variable" Display="always" Required="false" Mask="false">America/New_York</Config>
</Container>
EOF
    
    log_info "Unraid template installed to: ${TEMPLATE_PATH}/${APP_NAME}.xml"
}

# Build or pull Docker image
setup_image() {
    log_step "Setting up Docker image..."
    
    # Check if Dockerfile exists (for local build)
    if [ -f "Dockerfile" ]; then
        log_info "Dockerfile found, building image locally..."
        docker build -t "$IMAGE_NAME" .
    else
        log_warn "No Dockerfile found. You'll need to:"
        log_warn "1. Build the image on your development machine"
        log_warn "2. Save it: docker save $IMAGE_NAME | gzip > ${APP_NAME}.tar.gz"
        log_warn "3. Copy to Unraid and load: docker load < ${APP_NAME}.tar.gz"
        return 1
    fi
}

# Start the container
start_container() {
    log_step "Starting container..."
    
    docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        -p "${HOST_PORT}:${CONTAINER_PORT}" \
        -v "${DATA_PATH}:/app/data" \
        -v "${CSV_PATH}:/app/csv-imports:ro" \
        -e NODE_ENV=production \
        -e DB_PATH=/app/data/breaker_panel.db \
        -e PORT="$CONTAINER_PORT" \
        -e TZ=America/New_York \
        "$IMAGE_NAME"
    
    log_info "Container started successfully"
}

# Test the installation
test_installation() {
    log_step "Testing installation..."
    
    # Wait for container to start
    sleep 10
    
    # Check if container is running
    if docker ps | grep -q "$CONTAINER_NAME"; then
        log_info "Container is running"
    else
        log_error "Container is not running"
        docker logs "$CONTAINER_NAME"
        return 1
    fi
    
    # Test HTTP response
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:${HOST_PORT} | grep -q "200"; then
        log_info "Application is responding correctly"
    else
        log_error "Application is not responding"
        return 1
    fi
}

# Show completion message
show_completion() {
    local server_ip=$(ip route get 1 | awk '{print $7; exit}')
    
    echo ""
    echo "=========================================="
    log_info "Installation completed successfully!"
    echo "=========================================="
    echo ""
    log_info "Access your application at:"
    log_info "  Local:  http://localhost:${HOST_PORT}"
    log_info "  Remote: http://${server_ip}:${HOST_PORT}"
    echo ""
    log_info "Application data stored in:"
    log_info "  $DATA_PATH"
    echo ""
    log_info "To manage via Unraid WebUI:"
    log_info "  1. Go to Docker tab"
    log_info "  2. Look for 'Breaker-Panel-Helper' container"
    log_info "  3. Use the template for future deployments"
    echo ""
    log_info "For CSV imports, place files in:"
    log_info "  $CSV_PATH"
    echo ""
}

# Main installation process
main() {
    echo "=========================================="
    log_info "Breaker Panel Helper - Unraid Installation"
    echo "=========================================="
    echo ""
    
    # Run installation steps
    check_unraid
    create_directories
    stop_existing
    install_template
    
    # Try to setup image (optional if building locally)
    if ! setup_image; then
        log_warn "Skipping image build - you'll need to provide the image manually"
        log_warn "The template has been installed and you can configure it in the Docker tab"
        return 0
    fi
    
    start_container
    test_installation
    show_completion
}

# Handle help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo ""
    echo "This script installs Breaker Panel Helper on Unraid by:"
    echo "  1. Creating necessary directories"
    echo "  2. Installing Unraid template"
    echo "  3. Building/setting up Docker image"
    echo "  4. Starting the container"
    echo ""
    echo "Run this script on your Unraid server as root."
    exit 0
fi

# Run main function
main