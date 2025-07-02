# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development Commands
- `npm start` - Start the production server on port 3000
- `npm run dev` - Start development server with auto-restart using nodemon
- `node test-data.js` - Create test database with comprehensive sample data  
- `DB_PATH=test_breaker_panel.db npm start` - Run server with test database
- `node validate-features.js` - Validate all application features work correctly

### Database Management
- Default database: `breaker_panel.db` (SQLite)
- Test database: `test_breaker_panel.db` (isolated from development)
- Environment variables: `DB_PATH` (database path), `PORT` (server port, default 3000)

## Architecture Overview

### Application Structure
This is a full-stack electrical panel management application with:
- **Backend**: Node.js/Express server with SQLite database
- **Frontend**: Vanilla JavaScript with modular class-based architecture  
- **Database**: SQLite with foreign key relationships and automatic migrations

### Core Components

#### Server-Side (`server.js`)
- Express.js REST API with comprehensive CRUD endpoints
- SQLite database with automatic schema migrations
- Validation middleware with parameter-specific ID checking
- Graceful error handling and database connection management

#### Client-Side Architecture
- **Main App** (`app.js`): `BreakerPanelApp` - Central coordinator and event management
- **Panel Renderer** (`panel-renderer.js`): `PanelRenderer` - Visual panel layout, breaker display, modal management
- **Circuit List** (`circuit-list.js`): `CircuitListManager` - Tabular view, filtering, sorting
- **API Client** (`api-client.js`): `ApiClient` - All server communication with client-side validation

### Database Schema
- **panels**: Panel configuration (name, size 12-42 spaces)
- **breakers**: Individual breaker settings (position, amperage, flags, double_pole)
- **circuits**: Circuit details (room, type, notes, subpanel_id for hierarchical linking)

### Key Features
- **Multi-Panel Management**: Main panels auto-prioritized over subpanels
- **Double Pole Breakers**: Span vertically across positions (e.g., 1-3, 2-4)
- **Subpanel Linking**: Circuits can link to other panels via `subpanel_id`
- **Dual View Modes**: Visual panel representation and sortable circuit table
- **Advanced Filtering**: Real-time search, type filters, room filters, flag filters

## Development Patterns

### Error Handling
- Server uses `asyncHandler` wrapper for consistent error handling
- Client uses try/catch with `handleError()` method for user-friendly messages
- Validation occurs both client-side (ApiClient) and server-side (middleware)

### State Management
- `currentPanel` tracks active panel across views
- `allPanels` maintains sorted panel list (main panels first)
- Circuit data is fetched fresh for each view to ensure synchronization

### Electrical Panel Conventions
- Breaker positions: odd numbers (1,3,5...) on left, even (2,4,6...) on right
- Double pole breakers span 2 vertical positions (not horizontal)
- Amperage boxes positioned outside panel edges (left for odd, right for even)
- Critical/Monitor flags use distinct visual indicators

### CSS Architecture
- CSS custom properties for consistent theming
- Modular sections with clear separation of concerns
- Circuit type color coding with corresponding CSS classes
- Responsive design considerations already implemented

## Testing Strategy

Use the test database infrastructure for comprehensive testing:
1. Run `node test-data.js` to create realistic test scenarios
2. Test database includes 3 panels, 14 breakers, 18 circuits with proper relationships
3. Covers all circuit types, double pole configurations, and subpanel hierarchies
4. Validation script checks all major features programmatically

## API Design

RESTful endpoints with proper HTTP methods:
- GET for retrieval, POST for creation, PUT for updates, DELETE for removal
- Nested routes reflect relationships (e.g., `/panels/:panelId/breakers`)
- Consistent error responses with appropriate HTTP status codes
- All endpoints include validation and error handling