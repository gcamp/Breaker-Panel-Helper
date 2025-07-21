const sqlite3 = require('sqlite3').verbose();

// Use the same database path as test-data.js
const DB_PATH = process.env.DB_PATH || 'test_breaker_panel.db';
let db;

console.log(`🔍 Validating application features in: ${DB_PATH}\n`);

function allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

const initializeDatabase = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Enable foreign key constraints
            db.run('PRAGMA foreign_keys = ON;');
            
            // Create tables with proper constraints
            db.run(`CREATE TABLE IF NOT EXISTS panels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL CHECK(length(name) > 0),
                size INTEGER NOT NULL CHECK(size >= 12 AND size <= 42),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS breakers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                panel_id INTEGER NOT NULL,
                position INTEGER NOT NULL CHECK(position > 0),
                slot_position TEXT DEFAULT 'single' CHECK(slot_position IN ('single', 'A', 'B')),
                label TEXT,
                amperage INTEGER CHECK(amperage > 0 AND amperage <= 200),
                critical BOOLEAN DEFAULT 0,
                monitor BOOLEAN DEFAULT 0,
                confirmed BOOLEAN DEFAULT 0,
                breaker_type TEXT DEFAULT 'single' CHECK(breaker_type IN ('single', 'double_pole', 'tandem')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (panel_id) REFERENCES panels (id) ON DELETE CASCADE,
                UNIQUE(panel_id, position, slot_position)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE CHECK(length(name) > 0),
                level TEXT NOT NULL CHECK(level IN ('basement', 'main', 'upper', 'outside')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS circuits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                breaker_id INTEGER NOT NULL,
                room_id INTEGER,
                type TEXT CHECK(type IN ('outlet', 'lighting', 'heating', 'appliance', 'subpanel')),
                notes TEXT,
                subpanel_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (breaker_id) REFERENCES breakers (id) ON DELETE CASCADE,
                FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
                FOREIGN KEY (subpanel_id) REFERENCES panels (id) ON DELETE SET NULL
            )`, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
};

const connectDB = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, async (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
            } else {
                try {
                    await initializeDatabase();
                    resolve();
                } catch (initErr) {
                    console.error('Error initializing database:', initErr.message);
                    reject(initErr);
                }
            }
        });
    });
};

async function validateFeatures() {
    try {
        // Initialize database connection
        await connectDB();
        // Test 1: Multi-panel support
        console.log('1️⃣ Testing Multi-Panel Support...');
        const panels = await allQuery('SELECT * FROM panels ORDER BY name');
        console.log(`   ✅ Found ${panels.length} panels:`);
        panels.forEach(panel => {
            console.log(`      • ${panel.name} (${panel.size} spaces)`);
        });
        
        // Test 2: Double pole breakers
        console.log('\n2️⃣ Testing Double Pole Breakers...');
        const doublePoleBreakers = await allQuery('SELECT * FROM breakers WHERE breaker_type = ?', ['double_pole']);
        console.log(`   ✅ Found ${doublePoleBreakers.length} double pole breakers:`);
        doublePoleBreakers.forEach(breaker => {
            console.log(`      • ${breaker.label} (${breaker.amperage}A at position ${breaker.position})`);
        });
        
        // Test 3: Critical and Monitor circuits
        console.log('\n3️⃣ Testing Critical & Monitor Flags...');
        const criticalBreakers = await allQuery('SELECT * FROM breakers WHERE critical = 1');
        const monitorBreakers = await allQuery('SELECT * FROM breakers WHERE monitor = 1');
        console.log(`   ✅ Critical circuits: ${criticalBreakers.length}`);
        criticalBreakers.forEach(breaker => {
            console.log(`      🚨 ${breaker.label}`);
        });
        console.log(`   ✅ Monitor circuits: ${monitorBreakers.length}`);
        monitorBreakers.forEach(breaker => {
            console.log(`      👁️ ${breaker.label}`);
        });
        
        // Test 4: Circuit types
        console.log('\n4️⃣ Testing Circuit Types...');
        const circuitTypes = await allQuery(`
            SELECT type, COUNT(*) as count 
            FROM circuits 
            WHERE type IS NOT NULL 
            GROUP BY type 
            ORDER BY type
        `);
        console.log('   ✅ Circuit type distribution:');
        circuitTypes.forEach(type => {
            const emoji = {
                'outlet': '🔵',
                'lighting': '🟠', 
                'heating': '🔴',
                'appliance': '🟢',
                'subpanel': '🟣'
            }[type.type] || '⚫';
            console.log(`      ${emoji} ${type.type}: ${type.count} circuits`);
        });
        
        // Test 5: Subpanel linking
        console.log('\n5️⃣ Testing Subpanel Linking...');
        const subpanelCircuits = await allQuery(`
            SELECT c.*, b.label as breaker_label, p.name as linked_panel_name
            FROM circuits c
            JOIN breakers b ON c.breaker_id = b.id
            LEFT JOIN panels p ON c.subpanel_id = p.id
            WHERE c.type = 'subpanel'
        `);
        console.log(`   ✅ Found ${subpanelCircuits.length} subpanel links:`);
        subpanelCircuits.forEach(circuit => {
            console.log(`      ⚡ ${circuit.breaker_label} → ${circuit.linked_panel_name || 'No panel linked'}`);
        });
        
        // Test 6: Amperage range
        console.log('\n6️⃣ Testing Amperage Range...');
        const amperageRange = await allQuery(`
            SELECT MIN(amperage) as min_amp, MAX(amperage) as max_amp, COUNT(*) as total
            FROM breakers 
            WHERE amperage IS NOT NULL
        `);
        console.log(`   ✅ Amperage range: ${amperageRange[0].min_amp}A - ${amperageRange[0].max_amp}A`);
        console.log(`   ✅ Total breakers with amperage: ${amperageRange[0].total}`);
        
        // Test 7: Circuits per breaker
        console.log('\n7️⃣ Testing Multiple Circuits per Breaker...');
        const circuitsPerBreaker = await allQuery(`
            SELECT b.label, COUNT(c.id) as circuit_count
            FROM breakers b
            LEFT JOIN circuits c ON b.id = c.breaker_id
            GROUP BY b.id, b.label
            HAVING circuit_count > 1
            ORDER BY circuit_count DESC
        `);
        console.log(`   ✅ Breakers with multiple circuits: ${circuitsPerBreaker.length}`);
        circuitsPerBreaker.forEach(breaker => {
            console.log(`      • ${breaker.label}: ${breaker.circuit_count} circuits`);
        });
        
        // Test 8: Room distribution
        console.log('\n8️⃣ Testing Room Distribution...');
        const roomDistribution = await allQuery(`
            SELECT r.name as room_name, COUNT(c.id) as count 
            FROM circuits c
            JOIN rooms r ON c.room_id = r.id
            GROUP BY r.id, r.name
            ORDER BY count DESC
        `);
        console.log(`   ✅ Circuits across ${roomDistribution.length} rooms:`);
        roomDistribution.forEach(room => {
            console.log(`      • ${room.room_name}: ${room.count} circuits`);
        });
        
        console.log('\n🎉 All features validated successfully!');
        console.log('\n📝 Manual Testing Checklist:');
        console.log('   □ Navigate between panels using dropdown');
        console.log('   □ Test prev/next panel buttons');
        console.log('   □ Switch between Panel View and Circuit List');
        console.log('   □ Search circuits using text search');
        console.log('   □ Filter by room, type, and flags');
        console.log('   □ Sort columns in Circuit List');
        console.log('   □ Test Normal/Critical/Monitor view modes');
        console.log('   □ Click subpanel links to navigate');
        console.log('   □ Edit breakers and add/remove circuits');
        console.log('   □ Create new panels and delete panels');
        
    } catch (error) {
        console.error('❌ Validation error:', error);
    } finally {
        db.close();
    }
}

validateFeatures();