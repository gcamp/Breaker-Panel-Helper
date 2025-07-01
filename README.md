# Breaker Panel Helper

A comprehensive web application for managing electrical panel breakers with SQLite database storage, featuring multi-panel support, advanced circuit management, and powerful filtering capabilities.

## Features

### Panel Management
- **Multi-Panel Support**: Create and manage multiple electrical panels (main panels and subpanels)
- **Panel Configuration**: Select panel size (12-42 spaces) with automatic breaker numbering
- **Panel Navigation**: Switch between panels using dropdown, navigation buttons, or linked subpanels
- **Smart Panel Sorting**: Main panels automatically appear first, followed by subpanels

### Breaker & Circuit Management
- **Advanced Breaker Configuration**: Set labels, amperage (15A-100A), critical/monitor flags
- **Double Pole Support**: Create double pole breakers spanning vertically across positions
- **Multiple Circuits per Breaker**: Add unlimited circuits with room, type, and detailed notes
- **Circuit Types**: Categorized as Outlet, Lighting, Heating, Appliance, or Subpanel
- **Subpanel Linking**: Link circuits to other panels for hierarchical organization

### Visual Features
- **Color-Coded Circuit Types**: Distinctive colored pills for quick circuit identification
- **Visual Panel Layout**: Realistic electrical panel representation with proper numbering
- **External Amperage Display**: Sideways amperage boxes positioned outside the panel
- **Status Indicators**: Visual flags for critical circuits and monitoring requirements
- **View Modes**: Normal, Critical, and Monitor display modes with highlighting

### Circuit List & Filtering
- **Dual View Modes**: Toggle between visual Panel View and tabular Circuit List
- **Advanced Search**: Real-time text search across all circuit data
- **Smart Filtering**: Filter by room, circuit type, and status flags
- **Sortable Columns**: Click any column header to sort (breaker #, label, amperage, room, type, notes, flags, linked panels)
- **Visual Indicators**: Sort direction arrows and active column highlighting

### Data Management
- **SQLite Database**: Robust server-side data persistence with foreign key relationships
- **Real-time Updates**: Instant synchronization between panel view and circuit list
- **Data Validation**: Comprehensive input validation and error handling

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser to `http://localhost:3000`

## Development

For development with auto-restart:
```bash
npm run dev
```

## Testing

### Adding Test Data

To test all features without affecting your main database:

1. **Create test database with sample data:**
```bash
node test-data.js
```

2. **Start server with test database:**
```bash
DB_PATH=test_breaker_panel.db npm start
```

3. **Validate features:**
```bash
node validate-features.js
```

### Test Database Features

The test database includes:
- **3 panels**: Main Panel (40 spaces), Garage Subpanel (20 spaces), Workshop Subpanel (12 spaces)
- **Multiple breaker types**: Standard, double pole, critical, and monitor circuits
- **All circuit types**: Outlet, Lighting, Heating, Appliance, and Subpanel
- **Realistic scenarios**: EV charger, central AC, water heater, workshop equipment
- **Subpanel hierarchy**: Main → Garage → Workshop

### Environment Variables

- `DB_PATH`: Path to SQLite database file (default: `breaker_panel.db`)
- `PORT`: Server port (default: `3000`)

## Database Schema

- **panels**: Panel configuration (size, name)
- **breakers**: Individual breaker settings (position, amperage, flags)
- **circuits**: Circuit details per breaker (room, type, notes)

## API Endpoints

### Panels
- `GET /api/panels` - List all panels
- `POST /api/panels` - Create new panel
- `GET /api/panels/:id` - Get panel details
- `PUT /api/panels/:id` - Update panel
- `DELETE /api/panels/:id` - Delete panel

### Breakers
- `GET /api/panels/:panelId/breakers` - Get breakers for panel
- `POST /api/breakers` - Create breaker
- `GET /api/breakers/:id` - Get breaker details
- `PUT /api/breakers/:id` - Update breaker
- `DELETE /api/breakers/:id` - Delete breaker

### Circuits
- `GET /api/breakers/:breakerId/circuits` - Get circuits for breaker
- `POST /api/circuits` - Create circuit
- `PUT /api/circuits/:id` - Update circuit
- `DELETE /api/circuits/:id` - Delete circuit

## Usage

### Basic Panel Setup
1. **Create Panel**: Click "New Panel" and specify name and size (12-42 spaces)
2. **Configure Breakers**: Click any breaker position to open the configuration modal
3. **Set Properties**: Configure label, amperage, critical/monitor flags, and double pole settings
4. **Add Circuits**: Use "Add Circuit" to create multiple circuits per breaker
5. **Link Subpanels**: Set circuit type to "Subpanel" and link to another panel

### Advanced Features
- **Switch Views**: Toggle between "Panel View" (visual) and "Circuit List" (tabular)
- **Search & Filter**: Use the search bar and filters to find specific circuits quickly
- **Sort Data**: Click any column header in Circuit List to sort by that field
- **Navigate Panels**: Use dropdown selector or prev/next buttons to switch panels
- **Visual Modes**: Switch between Normal, Critical, and Monitor views for different perspectives

### Circuit Types & Color Coding
- **🔵 Outlet**: Standard electrical outlets (Blue)
- **🟠 Lighting**: Light fixtures and switches (Orange)  
- **🔴 Heating**: HVAC and heating systems (Red)
- **🟢 Appliance**: Major appliances (Green)
- **🟣 Subpanel**: Links to other electrical panels (Purple)

## Tips
- Main panels are automatically prioritized in the panel selector
- Double pole breakers span two vertical positions (e.g., positions 1-3)
- Use Critical flag for essential circuits (emergency lighting, security systems)
- Use Monitor flag for circuits requiring regular inspection
- Circuit search works across all fields: labels, rooms, notes, and types