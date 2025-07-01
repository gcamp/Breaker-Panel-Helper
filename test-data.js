const sqlite3 = require('sqlite3').verbose();

// Use a separate test database to avoid clashing with local development
const DB_PATH = process.env.DB_PATH || 'test_breaker_panel.db';
const db = new sqlite3.Database(DB_PATH);

console.log(`🧪 Adding comprehensive test data to: ${DB_PATH}`);

// Test data for multiple panels
const testData = {
    panels: [
        { name: 'Main Panel', size: 40 },
        { name: 'Garage Subpanel', size: 20 },
        { name: 'Workshop Subpanel', size: 12 }
    ],
    breakers: [
        // Main Panel breakers
        { panel_name: 'Main Panel', position: 1, label: 'Kitchen Outlets', amperage: 20, critical: false, monitor: false, double_pole: false },
        { panel_name: 'Main Panel', position: 2, label: 'Living Room Lights', amperage: 15, critical: false, monitor: false, double_pole: false },
        { panel_name: 'Main Panel', position: 3, label: 'Central AC Unit', amperage: 40, critical: true, monitor: true, double_pole: true },
        { panel_name: 'Main Panel', position: 5, label: 'Water Heater', amperage: 30, critical: false, monitor: true, double_pole: false },
        { panel_name: 'Main Panel', position: 6, label: 'Bedroom Outlets', amperage: 20, critical: false, monitor: false, double_pole: false },
        { panel_name: 'Main Panel', position: 7, label: 'Garage Subpanel Feed', amperage: 60, critical: true, monitor: false, double_pole: true },
        { panel_name: 'Main Panel', position: 9, label: 'Bathroom GFCI', amperage: 20, critical: false, monitor: true, double_pole: false },
        { panel_name: 'Main Panel', position: 10, label: 'Outdoor Lighting', amperage: 15, critical: false, monitor: false, double_pole: false },
        
        // Garage Subpanel breakers
        { panel_name: 'Garage Subpanel', position: 1, label: 'Garage Door Opener', amperage: 15, critical: false, monitor: true, double_pole: false },
        { panel_name: 'Garage Subpanel', position: 2, label: 'Workshop Outlets', amperage: 20, critical: false, monitor: false, double_pole: false },
        { panel_name: 'Garage Subpanel', position: 3, label: 'EV Charger', amperage: 50, critical: false, monitor: true, double_pole: true },
        { panel_name: 'Garage Subpanel', position: 5, label: 'Workshop Subpanel Feed', amperage: 30, critical: false, monitor: false, double_pole: false },
        
        // Workshop Subpanel breakers
        { panel_name: 'Workshop Subpanel', position: 1, label: 'Table Saw', amperage: 20, critical: false, monitor: false, double_pole: false },
        { panel_name: 'Workshop Subpanel', position: 2, label: 'Dust Collection', amperage: 15, critical: false, monitor: false, double_pole: false }
    ],
    circuits: [
        // Kitchen Outlets circuits
        { breaker_label: 'Kitchen Outlets', room: 'Kitchen', type: 'outlet', notes: 'Counter outlets and island' },
        { breaker_label: 'Kitchen Outlets', room: 'Kitchen', type: 'appliance', notes: 'Microwave outlet' },
        
        // Living Room Lights circuits
        { breaker_label: 'Living Room Lights', room: 'Living Room', type: 'lighting', notes: 'Overhead lights and lamps' },
        { breaker_label: 'Living Room Lights', room: 'Dining Room', type: 'lighting', notes: 'Chandelier' },
        
        // Central AC circuits
        { breaker_label: 'Central AC Unit', room: 'Utility Room', type: 'heating', notes: '3-ton central air conditioning unit' },
        
        // Water Heater circuits
        { breaker_label: 'Water Heater', room: 'Utility Room', type: 'appliance', notes: '50-gallon electric water heater' },
        
        // Bedroom Outlets circuits
        { breaker_label: 'Bedroom Outlets', room: 'Master Bedroom', type: 'outlet', notes: 'All bedroom outlets' },
        { breaker_label: 'Bedroom Outlets', room: 'Guest Bedroom', type: 'outlet', notes: 'Guest room outlets' },
        
        // Garage Subpanel Feed circuits
        { breaker_label: 'Garage Subpanel Feed', room: 'Garage', type: 'subpanel', notes: 'Main feed to garage electrical panel', subpanel_name: 'Garage Subpanel' },
        
        // Bathroom GFCI circuits
        { breaker_label: 'Bathroom GFCI', room: 'Master Bathroom', type: 'outlet', notes: 'GFCI protected outlets' },
        { breaker_label: 'Bathroom GFCI', room: 'Guest Bathroom', type: 'outlet', notes: 'GFCI protected outlets' },
        
        // Outdoor Lighting circuits
        { breaker_label: 'Outdoor Lighting', room: 'Exterior', type: 'lighting', notes: 'Porch and landscape lighting' },
        
        // Garage circuits
        { breaker_label: 'Garage Door Opener', room: 'Garage', type: 'appliance', notes: 'Overhead garage door motor' },
        { breaker_label: 'Workshop Outlets', room: 'Garage', type: 'outlet', notes: 'General purpose outlets' },
        { breaker_label: 'EV Charger', room: 'Garage', type: 'appliance', notes: 'Level 2 electric vehicle charger' },
        { breaker_label: 'Workshop Subpanel Feed', room: 'Workshop', type: 'subpanel', notes: 'Feed to workshop panel', subpanel_name: 'Workshop Subpanel' },
        
        // Workshop circuits
        { breaker_label: 'Table Saw', room: 'Workshop', type: 'appliance', notes: 'Cabinet table saw 220V' },
        { breaker_label: 'Dust Collection', room: 'Workshop', type: 'appliance', notes: 'Central dust collection system' }
    ]
};

let panelIds = {};
let breakerIds = {};

// Helper function to run async database operations
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function addTestData() {
    try {
        // Initialize database schema first
        console.log('🗄️ Initializing test database schema...');
        await runQuery(`CREATE TABLE IF NOT EXISTS panels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            size INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS breakers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            panel_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            label TEXT,
            amperage INTEGER,
            critical BOOLEAN DEFAULT 0,
            monitor BOOLEAN DEFAULT 0,
            double_pole BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (panel_id) REFERENCES panels (id) ON DELETE CASCADE
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS circuits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            breaker_id INTEGER NOT NULL,
            room TEXT,
            type TEXT CHECK(type IN ('outlet', 'lighting', 'heating', 'appliance', 'subpanel')),
            notes TEXT,
            subpanel_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (breaker_id) REFERENCES breakers (id) ON DELETE CASCADE,
            FOREIGN KEY (subpanel_id) REFERENCES panels (id) ON DELETE SET NULL
        )`);
        
        console.log('📋 Creating test panels...');
        
        // Add panels
        for (const panel of testData.panels) {
            const result = await runQuery(
                'INSERT INTO panels (name, size) VALUES (?, ?)', 
                [panel.name, panel.size]
            );
            panelIds[panel.name] = result.id;
            console.log(`✅ Created panel: ${panel.name} (ID: ${result.id})`);
        }
        
        console.log('🔌 Creating test breakers...');
        
        // Add breakers
        for (const breaker of testData.breakers) {
            const panelId = panelIds[breaker.panel_name];
            const result = await runQuery(
                'INSERT INTO breakers (panel_id, position, label, amperage, critical, monitor, double_pole) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [panelId, breaker.position, breaker.label, breaker.amperage, breaker.critical, breaker.monitor, breaker.double_pole]
            );
            breakerIds[breaker.label] = result.id;
            console.log(`✅ Created breaker: ${breaker.label} (Position ${breaker.position})`);
        }
        
        console.log('⚡ Creating test circuits...');
        
        // Add circuits
        for (const circuit of testData.circuits) {
            const breakerId = breakerIds[circuit.breaker_label];
            let subpanelId = null;
            
            if (circuit.subpanel_name) {
                subpanelId = panelIds[circuit.subpanel_name];
            }
            
            await runQuery(
                'INSERT INTO circuits (breaker_id, room, type, notes, subpanel_id) VALUES (?, ?, ?, ?, ?)',
                [breakerId, circuit.room, circuit.type, circuit.notes, subpanelId]
            );
            console.log(`✅ Created circuit: ${circuit.room} - ${circuit.type}`);
        }
        
        // Show summary
        const panelCount = await getQuery('SELECT COUNT(*) as count FROM panels');
        const breakerCount = await getQuery('SELECT COUNT(*) as count FROM breakers');
        const circuitCount = await getQuery('SELECT COUNT(*) as count FROM circuits');
        
        console.log('\n📊 Test Data Summary:');
        console.log(`   Panels: ${panelCount.count}`);
        console.log(`   Breakers: ${breakerCount.count}`);
        console.log(`   Circuits: ${circuitCount.count}`);
        console.log('\n🎉 Test data added successfully!');
        console.log('🌐 To test with this data:');
        console.log(`   1. Stop the current server`);
        console.log(`   2. Run: DB_PATH=${DB_PATH} npm start`);
        console.log(`   3. Visit http://localhost:3000`);
        
        // Test features checklist
        console.log('\n✅ Features to Test:');
        console.log('   • Multi-panel navigation (Main Panel, Garage Subpanel, Workshop Subpanel)');
        console.log('   • Double pole breakers (Central AC, Garage Subpanel Feed, EV Charger)');
        console.log('   • Critical circuits (Central AC, Garage Subpanel Feed)');
        console.log('   • Monitor circuits (Water Heater, Bathroom GFCI, etc.)');
        console.log('   • All circuit types (Outlet, Lighting, Heating, Appliance, Subpanel)');
        console.log('   • Subpanel linking (Garage → Workshop)');
        console.log('   • Circuit List view with search and filtering');
        console.log('   • Column sorting in Circuit List');
        console.log('   • Visual mode switching (Normal, Critical, Monitor)');
        
    } catch (error) {
        console.error('❌ Error adding test data:', error);
    } finally {
        db.close();
    }
}

// Run the test data creation
addTestData();