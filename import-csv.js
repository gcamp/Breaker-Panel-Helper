#!/usr/bin/env node

/**
 * CSV Import Script for Breaker Panel Helper
 * Imports electrical panel data from "Panneau electrique - Liste.csv"
 * 
 * Usage: node import-csv.js [database_path]
 * Example: node import-csv.js panel_imported.db
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Configuration
const CSV_FILE = 'Panneau electrique - Liste.csv';
const DEFAULT_DB = 'panel_imported.db';

class CSVImporter {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.stats = {
            panels: 0,
            rooms: 0,
            breakers: 0,
            circuits: 0,
            warnings: []
        };
    }

    // Database helper functions
    async dbRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    async dbGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async dbAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Initialize database connection
    async initDatabase() {
        return new Promise((resolve, reject) => {
            // Remove existing database if it exists
            if (fs.existsSync(this.dbPath)) {
                fs.unlinkSync(this.dbPath);
                console.log(`🗑️ Removed existing database: ${this.dbPath}`);
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`🗄️ Created new database: ${this.dbPath}`);
                    resolve();
                }
            });
        });
    }

    // Create database schema
    async createSchema() {
        console.log('📋 Creating database schema...');

        // Enable foreign keys
        await this.dbRun('PRAGMA foreign_keys = ON');

        // Create panels table
        await this.dbRun(`CREATE TABLE panels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL CHECK(length(name) > 0),
            size INTEGER NOT NULL CHECK(size >= 12 AND size <= 42),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create rooms table
        await this.dbRun(`CREATE TABLE rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE CHECK(length(name) > 0),
            level TEXT NOT NULL CHECK(level IN ('basement', 'main', 'upper', 'outside')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create breakers table
        await this.dbRun(`CREATE TABLE breakers (
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

        // Create circuits table
        await this.dbRun(`CREATE TABLE circuits (
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
        )`);

        console.log('✅ Database schema created successfully');
    }

    // Parse CSV file
    parseCSV(csvContent) {
        const lines = csvContent.split('\n');
        const header = lines[0].split(',');
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line === ',' || line.split(',').every(cell => !cell.trim())) {
                continue; // Skip empty lines
            }

            const row = this.parseCSVLine(line);
            if (row.length >= 8) {
                data.push({
                    breaker: row[0]?.trim(),
                    critical: row[1]?.trim(),
                    monitor: row[2]?.trim(),
                    amperage: row[3]?.trim(),
                    confirmed: row[4]?.trim(),
                    room: row[5]?.trim(),
                    type: row[6]?.trim(),
                    description: row[7]?.trim()
                });
            }
        }

        console.log(`📄 Parsed ${data.length} entries from CSV`);
        return data.filter(row => row.breaker && row.breaker !== '?');
    }

    // Parse CSV line handling quotes and commas
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    // Parse breaker position and determine type
    parseBreakerPosition(breakerStr) {
        if (!breakerStr || breakerStr === '?') {
            return null;
        }

        // Handle tandem positions (4A, 4B)
        const tandemMatch = breakerStr.match(/^(\d+)([AB])$/);
        if (tandemMatch) {
            return {
                position: parseInt(tandemMatch[1]),
                slotPosition: tandemMatch[2],
                breakerType: 'tandem'
            };
        }

        // Handle double-pole positions (5-7, 21-23)
        const doublePoleMatch = breakerStr.match(/^(\d+)-(\d+)$/);
        if (doublePoleMatch) {
            return {
                position: parseInt(doublePoleMatch[1]),
                slotPosition: 'single',
                breakerType: 'double_pole'
            };
        }

        // Handle single positions (1, 2, 3)
        const singleMatch = breakerStr.match(/^(\d+)$/);
        if (singleMatch) {
            return {
                position: parseInt(singleMatch[1]),
                slotPosition: 'single',
                breakerType: 'single'
            };
        }

        return null;
    }

    // Map French room names to levels
    mapRoomLevel(roomName) {
        const roomLower = roomName.toLowerCase();
        
        if (roomLower.includes('sous-sol') || roomLower.includes('sous-')) {
            return 'basement';
        }
        if (roomLower.includes('étage')) {
            return 'upper';
        }
        if (roomLower.includes('extérieur')) {
            return 'outside';
        }
        
        return 'main';
    }

    // Map French circuit types to English
    mapCircuitType(frenchType) {
        const typeMap = {
            'prise': 'outlet',
            'éclairage': 'lighting',
            'appareil': 'appliance',
            'chauffage': 'heating',
            'sous-panneau': 'subpanel'
        };

        return typeMap[frenchType?.toLowerCase()] || 'outlet';
    }

    // Check if a flag emoji is present
    hasFlag(flagStr, emoji) {
        return flagStr && flagStr.includes(emoji);
    }

    // Create main panel
    async createMainPanel() {
        console.log('🏠 Creating main panel...');
        
        const result = await this.dbRun(
            'INSERT INTO panels (name, size) VALUES (?, ?)',
            ['Panneau Principal', 42]
        );

        this.stats.panels++;
        console.log(`✅ Created main panel (ID: ${result.id})`);
        return result.id;
    }

    // Import rooms from CSV data
    async importRooms(csvData) {
        console.log('🏠 Importing rooms...');
        
        // Extract unique room names
        const uniqueRooms = [...new Set(csvData
            .map(row => row.room)
            .filter(room => room && room.trim())
        )];

        const roomIds = new Map();

        for (const roomName of uniqueRooms) {
            const level = this.mapRoomLevel(roomName);
            
            try {
                const result = await this.dbRun(
                    'INSERT INTO rooms (name, level) VALUES (?, ?)',
                    [roomName.trim(), level]
                );
                
                roomIds.set(roomName.trim(), result.id);
                this.stats.rooms++;
                console.log(`  ✅ ${roomName} (${level})`);
            } catch (error) {
                // Room might already exist
                const existing = await this.dbGet(
                    'SELECT id FROM rooms WHERE name = ?',
                    [roomName.trim()]
                );
                if (existing) {
                    roomIds.set(roomName.trim(), existing.id);
                }
            }
        }

        console.log(`✅ Imported ${this.stats.rooms} rooms`);
        return roomIds;
    }

    // Import breakers and circuits
    async importBreakersAndCircuits(csvData, panelId, roomIds) {
        console.log('🔌 Importing breakers and circuits...');

        // Group circuits by breaker position
        const breakerGroups = new Map();
        
        for (const row of csvData) {
            const breakerInfo = this.parseBreakerPosition(row.breaker);
            if (!breakerInfo) {
                this.stats.warnings.push(`Invalid breaker position: ${row.breaker}`);
                continue;
            }

            const key = `${breakerInfo.position}-${breakerInfo.slotPosition}`;
            if (!breakerGroups.has(key)) {
                breakerGroups.set(key, {
                    breakerInfo,
                    circuits: [],
                    amperage: null,
                    critical: false,
                    monitor: false,
                    confirmed: false
                });
            }

            const group = breakerGroups.get(key);
            
            // Add circuit to group
            group.circuits.push(row);
            
            // Set breaker properties (use first non-empty value)
            if (row.amperage && !group.amperage) {
                group.amperage = parseInt(row.amperage);
            }
            if (this.hasFlag(row.critical, '🔋')) {
                group.critical = true;
            }
            if (this.hasFlag(row.monitor, '📈')) {
                group.monitor = true;
            }
            if (this.hasFlag(row.confirmed, '✅')) {
                group.confirmed = true;
            }
        }

        // Create breakers and their circuits
        for (const [key, group] of breakerGroups) {
            try {
                // Create breaker
                const breakerResult = await this.dbRun(`
                    INSERT INTO breakers (
                        panel_id, position, slot_position, amperage, 
                        critical, monitor, confirmed, breaker_type
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    panelId,
                    group.breakerInfo.position,
                    group.breakerInfo.slotPosition,
                    group.amperage,
                    group.critical ? 1 : 0,
                    group.monitor ? 1 : 0,
                    group.confirmed ? 1 : 0,
                    group.breakerInfo.breakerType
                ]);

                this.stats.breakers++;
                
                const breakerLabel = `${group.breakerInfo.position}${group.breakerInfo.slotPosition !== 'single' ? group.breakerInfo.slotPosition : ''}`;
                console.log(`  ✅ Breaker ${breakerLabel} (${group.amperage}A) - ${group.circuits.length} circuits`);

                // Create circuits for this breaker
                for (const circuit of group.circuits) {
                    const roomId = roomIds.get(circuit.room?.trim()) || null;
                    const circuitType = this.mapCircuitType(circuit.type);
                    
                    await this.dbRun(`
                        INSERT INTO circuits (breaker_id, room_id, type, notes)
                        VALUES (?, ?, ?, ?)
                    `, [
                        breakerResult.id,
                        roomId,
                        circuitType,
                        circuit.description || null
                    ]);

                    this.stats.circuits++;
                }

            } catch (error) {
                this.stats.warnings.push(`Failed to create breaker ${group.breakerInfo.position}: ${error.message}`);
            }
        }

        console.log(`✅ Imported ${this.stats.breakers} breakers with ${this.stats.circuits} circuits`);
    }

    // Main import function
    async import() {
        try {
            console.log('🚀 Starting CSV import process...\n');

            // Check if CSV file exists
            if (!fs.existsSync(CSV_FILE)) {
                throw new Error(`CSV file not found: ${CSV_FILE}`);
            }

            // Initialize database
            await this.initDatabase();
            await this.createSchema();

            // Read and parse CSV
            const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
            const csvData = this.parseCSV(csvContent);

            if (csvData.length === 0) {
                throw new Error('No valid data found in CSV file');
            }

            // Import data
            const panelId = await this.createMainPanel();
            const roomIds = await this.importRooms(csvData);
            await this.importBreakersAndCircuits(csvData, panelId, roomIds);

            // Print summary
            console.log('\n📊 Import Summary:');
            console.log(`   Panels created: ${this.stats.panels}`);
            console.log(`   Rooms imported: ${this.stats.rooms}`);
            console.log(`   Breakers created: ${this.stats.breakers}`);
            console.log(`   Circuits imported: ${this.stats.circuits}`);
            
            if (this.stats.warnings.length > 0) {
                console.log(`\n⚠️ Warnings (${this.stats.warnings.length}):`);
                this.stats.warnings.forEach(warning => console.log(`   • ${warning}`));
            }

            console.log(`\n🎉 Import completed successfully!`);
            console.log(`📁 Database saved as: ${this.dbPath}`);
            console.log(`\n🌐 To test the imported data:`);
            console.log(`   1. DB_PATH=${this.dbPath} npm start`);
            console.log(`   2. Visit http://localhost:3000`);

        } catch (error) {
            console.error('❌ Import failed:', error.message);
            throw error;
        } finally {
            if (this.db) {
                this.db.close();
            }
        }
    }
}

// Main execution
async function main() {
    const dbPath = process.argv[2] || DEFAULT_DB;
    
    console.log(`📦 CSV Import Tool for Breaker Panel Helper`);
    console.log(`📄 Source: ${CSV_FILE}`);
    console.log(`🗄️ Target: ${dbPath}\n`);

    const importer = new CSVImporter(dbPath);
    await importer.import();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = CSVImporter;