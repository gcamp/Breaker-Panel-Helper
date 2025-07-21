const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const { router, setDbHelpers } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // More secure than bodyParser
app.use(express.static('public'));

// Register routes (helpers will be set later)
app.use('/api', router);

// Database connection
let db;

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

// Database helper functions
const dbGet = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};



// Static route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('Server error:', err);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Database initialization and server startup
const connectDB = () => {
    return new Promise((resolve, reject) => {
        const DB_PATH = process.env.DB_PATH || 'breaker_panel.db';
        db = new sqlite3.Database(DB_PATH, async (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
            } else {
                console.log(`Connected to SQLite database: ${DB_PATH}`);
                try {
                    await initializeDatabase();
                    
                    // Initialize database helpers for routes
                    setDbHelpers({ dbGet, dbAll, dbRun });
                    
                    resolve();
                } catch (initErr) {
                    console.error('Error initializing database:', initErr.message);
                    reject(initErr);
                }
            }
        });
    });
};

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('\nReceived shutdown signal, closing database...');
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
                process.exit(1);
            } else {
                console.log('Database connection closed');
                process.exit(0);
            }
        });
    } else {
        process.exit(0);
    }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Export the app and connectDB for testing
module.exports = app;
module.exports.connectDB = connectDB;

// Start server only when run directly (not when imported)
if (require.main === module) {
    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server running on http://localhost:${PORT}`);
            });
        })
        .catch((err) => {
            console.error('Failed to start server:', err);
            process.exit(1);
        });
}