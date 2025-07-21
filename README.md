# Breaker Panel Helper

[![CI/CD Pipeline](https://github.com/gcamp/breaker-panel-helper/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/your-username/breaker-panel-helper/actions)
[![Docker Image](https://ghcr-badge.egpl.dev/gcamp/breaker-panel-helper/latest_by_date)](https://github.com/your-username/breaker-panel-helper/pkgs/container/breaker-panel-helper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive web application for managing electrical panel breakers with advanced features including tandem breaker support, room management, and circuit tracking.

## Features

- **Multi-Panel Support**: Manage multiple electrical panels and subpanels
- **Comprehensive Breaker Types**:
  - Single pole breakers
  - Double pole breakers (spans 2 positions vertically)
  - Tandem breakers (A+B in same slot)
- **Circuit Management**: Track circuits with room assignments, types, and notes
- **Room Management**: Organize rooms by levels (basement, main, upper) with color coding
- **Visual Panel Display**: Realistic electrical panel layout with proper numbering
- **Circuit List View**: Searchable and sortable table view of all circuits
- **Print Functionality**: Print-friendly panel documentation
- **Mobile Responsive**: Works on desktop, tablet, and mobile devices
- **Data Validation**: Comprehensive input validation and error handling

## Quick Start with Docker

### Using GitHub Container Registry (Recommended)

```bash
# Pull and run the latest image
docker run -d \
  --name breaker-panel-helper \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ./data:/app/data \
  ghcr.io/your-username/breaker-panel-helper:latest
```

### Using Docker Compose

```bash
# Clone the repository
git clone https://github.com/your-username/breaker-panel-helper.git
cd breaker-panel-helper

# Start with docker-compose
docker-compose up -d
```

### Unraid Installation

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete Unraid setup instructions.

## Development Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/breaker-panel-helper.git
   cd breaker-panel-helper
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   Open your browser to `http://localhost:3000`

## Development

### Running in Development Mode

```bash
npm run dev
```

This starts the server with nodemon for automatic restarts.

### Adding Test Data

```bash
npm run add-test-data
```

This creates comprehensive test data including multiple panels, breakers, and circuits.

## Testing

The application includes comprehensive test coverage:

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
npm run test:api          # API endpoint tests
npm run test:integration  # Integration tests
npm run test:frontend     # Frontend unit tests
```

### Test Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## API Documentation

### Panels

- `GET /api/panels` - Get all panels
- `POST /api/panels` - Create new panel
- `GET /api/panels/:id` - Get specific panel
- `PUT /api/panels/:id` - Update panel
- `DELETE /api/panels/:id` - Delete panel

### Breakers

- `GET /api/panels/:panelId/breakers` - Get breakers by panel
- `GET /api/breakers/:id` - Get specific breaker
- `GET /api/panels/:panelId/breakers/position/:position` - Get breaker by position
- `POST /api/breakers` - Create new breaker
- `PUT /api/breakers/:id` - Update breaker
- `DELETE /api/breakers/:id` - Delete breaker

### Rooms

- `GET /api/rooms` - Get all rooms (ordered by level)
- `POST /api/rooms` - Create new room
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room

### Circuits

- `GET /api/circuits` - Get all circuits with room information
- `GET /api/breakers/:breakerId/circuits` - Get circuits by breaker
- `POST /api/circuits` - Create new circuit
- `PUT /api/circuits/:id` - Update circuit
- `DELETE /api/circuits/:id` - Delete circuit

## Database Schema

### Panels
- `id` - Primary key
- `name` - Panel name
- `size` - Number of breaker positions (12-42)
- `created_at` - Timestamp

### Breakers
- `id` - Primary key
- `panel_id` - Foreign key to panels
- `position` - Breaker position (1-42)
- `slot_position` - For tandem breakers ('single', 'A', 'B')
- `label` - Breaker label
- `amperage` - Breaker amperage (1-200A)
- `critical` - Critical circuit flag
- `monitor` - Should monitor flag
- `confirmed` - Tested and confirmed flag
- `tandem` - Tandem breaker flag
- `double_pole` - Double pole breaker flag
- `created_at` - Timestamp

### Rooms
- `id` - Primary key
- `name` - Room name (unique)
- `level` - Level ('basement', 'main', 'upper')
- `created_at` - Timestamp

### Circuits
- `id` - Primary key
- `breaker_id` - Foreign key to breakers
- `room_id` - Foreign key to rooms
- `type` - Circuit type ('outlet', 'lighting', 'heating', 'appliance', 'subpanel')
- `notes` - Additional notes
- `subpanel_id` - Foreign key to panels (for subpanel circuits)
- `created_at` - Timestamp

## Electrical Panel Conventions

The application follows standard electrical panel conventions:

- **Position Numbering**: Odd numbers on left (1, 3, 5...), even numbers on right (2, 4, 6...)
- **Double Pole Breakers**: Span two positions vertically (e.g., positions 1-3)
- **Tandem Breakers**: Two breakers in one slot (e.g., 1A and 1B)
- **Subpanel Links**: Only shown on double pole breakers (typically 240V feeds)

## Technology Stack

- **Backend**: Node.js, Express.js, SQLite3
- **Frontend**: Vanilla JavaScript (ES6+), CSS3, HTML5
- **Testing**: Jest, Supertest, JSDOM
- **Development**: Nodemon, ESLint

## Code Quality

- **Linting**: ESLint with recommended rules
- **Testing**: >90% code coverage with unit, integration, and performance tests
- **Error Handling**: Comprehensive error handling and validation
- **Security**: Input validation, SQL injection prevention, CORS protection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Run linting and fix any issues
6. Submit a pull request

## Performance

The application is optimized for performance:

- Database indexing for fast queries
- Efficient API endpoints with proper HTTP status codes
- Responsive design with optimized mobile layouts
- Print-optimized CSS for documentation

Performance benchmarks (run `npm run test:performance`):
- Can handle 1000+ breakers efficiently
- Average query time <100ms
- Supports 20+ concurrent users
- Memory-efficient with no significant leaks

## License

MIT License - see LICENSE file for details.
