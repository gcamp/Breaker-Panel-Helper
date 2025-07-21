# Breaker Panel Helper - Deployment Guide

## Docker Deployment for Unraid

This guide covers deploying the Breaker Panel Helper application on an Unraid server using Docker.

## Quick Start (Unraid Community Applications)

### Option 1: Use Pre-built Image from GitHub (Recommended)

```bash
docker run -d \
  --name breaker-panel-helper \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /mnt/user/appdata/breaker-panel-helper/data:/app/data \
  -v /mnt/user/appdata/breaker-panel-helper/csv-imports:/app/csv-imports:ro \
  -e NODE_ENV=production \
  -e TZ=America/New_York \
  ghcr.io/your-username/breaker-panel-helper:latest
```

### Option 2: Install from Template
- Copy `unraid-template.xml` to your Unraid server
- Add it to Community Applications or use it directly in Docker tab
- Configure paths and start the container

### Option 3: Build Locally
```bash
# Clone and build
git clone https://github.com/your-username/breaker-panel-helper.git
cd breaker-panel-helper
docker build -t breaker-panel-helper:latest .

# Then run with local image
docker run -d \
  --name breaker-panel-helper \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /mnt/user/appdata/breaker-panel-helper/data:/app/data \
  -e NODE_ENV=production \
  breaker-panel-helper:latest
```

## Build and Deploy Steps

### 1. Prepare the Build Environment

```bash
# On your development machine or Unraid server
cd /path/to/breaker-panel-helper
```

### 2. Build the Docker Image

```bash
# Build the production image
docker build -t breaker-panel-helper:latest .

# Optional: Build with specific version tag
docker build -t breaker-panel-helper:v1.0.0 .
```

### 3. Create Required Directories on Unraid

```bash
# SSH into your Unraid server and create directories
mkdir -p /mnt/user/appdata/breaker-panel-helper/data
mkdir -p /mnt/user/appdata/breaker-panel-helper/csv-imports

# Set proper permissions
chown -R 1001:1001 /mnt/user/appdata/breaker-panel-helper
```

### 4. Deploy Using Docker Compose (Alternative)

```bash
# Copy docker-compose.yml to your server
docker-compose up -d
```

### 5. Deploy Using Unraid Template

1. Copy `unraid-template.xml` to `/boot/config/plugins/dockerMan/templates-user/`
2. Go to Docker tab in Unraid WebUI
3. Click "Add Container" and select "breaker-panel-helper"
4. Configure settings and apply

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Application environment |
| `DB_PATH` | `/app/data/breaker_panel.db` | SQLite database file path |
| `PORT` | `3000` | Application port |
| `TZ` | `America/New_York` | Container timezone |

### Volume Mounts

| Host Path | Container Path | Purpose | Required |
|-----------|----------------|---------|----------|
| `/mnt/user/appdata/breaker-panel-helper/data` | `/app/data` | Database storage | Yes |
| `/mnt/user/appdata/breaker-panel-helper/csv-imports` | `/app/csv-imports` | CSV import files | No |

### Port Mapping

| Host Port | Container Port | Protocol | Purpose |
|-----------|----------------|----------|---------|
| `3000` | `3000` | TCP | Web interface |

## First-Time Setup

1. **Access the Application**:
   - Navigate to `http://your-unraid-ip:3000`
   - The application will create the default database automatically

2. **Import Existing Data** (Optional):
   - Place CSV files in the `csv-imports` directory
   - Use the application's import functionality

3. **Create Initial Panel**:
   - The app will create a default 40-space panel on first load
   - You can modify or create additional panels as needed

## Backup and Restore

### Backup

```bash
# Backup the entire data directory
tar -czf breaker-panel-backup-$(date +%Y%m%d).tar.gz \
  -C /mnt/user/appdata/breaker-panel-helper data/

# Or just the database file
cp /mnt/user/appdata/breaker-panel-helper/data/breaker_panel.db \
   /mnt/user/backups/breaker_panel_$(date +%Y%m%d).db
```

### Restore

```bash
# Stop the container first
docker stop breaker-panel-helper

# Restore from backup
tar -xzf breaker-panel-backup-YYYYMMDD.tar.gz \
  -C /mnt/user/appdata/breaker-panel-helper/

# Or restore database file
cp /mnt/user/backups/breaker_panel_YYYYMMDD.db \
   /mnt/user/appdata/breaker-panel-helper/data/breaker_panel.db

# Fix permissions
chown -R 1001:1001 /mnt/user/appdata/breaker-panel-helper

# Start the container
docker start breaker-panel-helper
```

## Updating the Application

### Using Docker Compose

```bash
# Pull latest image and restart
docker-compose pull
docker-compose up -d
```

### Manual Update

```bash
# Stop current container
docker stop breaker-panel-helper
docker rm breaker-panel-helper

# Pull/build new image
docker build -t breaker-panel-helper:latest .

# Start new container with same configuration
docker run -d \
  --name breaker-panel-helper \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /mnt/user/appdata/breaker-panel-helper/data:/app/data \
  -e NODE_ENV=production \
  breaker-panel-helper:latest
```

## Troubleshooting

### Check Container Logs

```bash
# View live logs
docker logs -f breaker-panel-helper

# View last 100 lines
docker logs --tail 100 breaker-panel-helper
```

### Check Container Health

```bash
# Check health status
docker inspect breaker-panel-helper | grep -A 5 '"Health"'

# Test connectivity
curl http://localhost:3000
```

### Common Issues

1. **Permission Denied on Database**:
   ```bash
   chown -R 1001:1001 /mnt/user/appdata/breaker-panel-helper
   ```

2. **Port Already in Use**:
   - Change the host port mapping: `-p 3001:3000`

3. **Database Lock Errors**:
   - Ensure only one container instance is running
   - Check that the data directory is properly mounted

## Security Considerations

- The application runs as non-root user (UID 1001)
- No sensitive data is logged
- Database is stored in persistent volume
- Consider using a reverse proxy with SSL for external access

## Performance Tuning

- **Memory**: Container typically uses ~50-100MB RAM
- **CPU**: Minimal CPU usage for typical workloads
- **Storage**: Database size depends on number of panels/circuits
- **Network**: Single port exposure, minimal bandwidth usage

## Integration with Unraid

### Reverse Proxy Setup (Nginx Proxy Manager)

```nginx
# Example configuration for subdomain access
location / {
    proxy_pass http://breaker-panel-helper:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Notifications

The container supports health checks that can be integrated with Unraid's notification system for monitoring container status.

## CI/CD Pipeline

This project uses GitHub Actions for automated testing, building, and publishing Docker images.

### Automated Builds

Every push to the `main` branch automatically:
1. Runs comprehensive tests (Node.js 18.x and 20.x)
2. Performs security scans
3. Builds multi-architecture Docker images (amd64, arm64)
4. Publishes to GitHub Container Registry
5. Updates documentation

### Available Images

- **Latest stable**: `ghcr.io/your-username/breaker-panel-helper:latest`
- **Version tags**: `ghcr.io/your-username/breaker-panel-helper:v1.0.0`
- **Branch builds**: `ghcr.io/your-username/breaker-panel-helper:main`

### Manual Testing

Before pushing changes, you can test locally:

```bash
# Run the same tests as CI
./scripts/test-ci-locally.sh

# Build Docker image manually
./scripts/build-and-deploy.sh
```

### Release Process

1. Create a new tag: `git tag v1.0.0`
2. Push the tag: `git push origin v1.0.0`
3. GitHub Actions will automatically create a release and build images

## Support

For issues specific to deployment:
1. Check container logs
2. Verify volume mounts and permissions
3. Ensure port availability
4. Review environment variables

For application issues, refer to the main application documentation in `CLAUDE.md`.