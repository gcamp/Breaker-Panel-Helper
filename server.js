const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || 'breaker_panel.db';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // More secure than bodyParser
app.use(express.static('public'));

// Database connection
let db;

const initializeDatabase = () => {
    db.serialize(() => {
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
            label TEXT,
            amperage INTEGER CHECK(amperage > 0 AND amperage <= 200),
            critical BOOLEAN DEFAULT 0,
            monitor BOOLEAN DEFAULT 0,
            double_pole BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (panel_id) REFERENCES panels (id) ON DELETE CASCADE,
            UNIQUE(panel_id, position)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS circuits (
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

        // Migration for existing databases
        db.all(`PRAGMA table_info(circuits)`, (err, rows) => {
            if (err) {
                console.error('Error checking circuits table structure:', err);
                return;
            }
            
            const hasSubpanelId = rows.some(row => row.name === 'subpanel_id');
            if (!hasSubpanelId) {
                console.log('Adding subpanel_id column to circuits table...');
                db.run(`ALTER TABLE circuits ADD COLUMN subpanel_id INTEGER REFERENCES panels(id) ON DELETE SET NULL`, (err) => {
                    if (err) {
                        console.error('Error adding subpanel_id column:', err);
                    } else {
                        console.log('Successfully added subpanel_id column');
                    }
                });
            }
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

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const validateId = (paramName = 'id') => (req, res, next) => {
    const id = parseInt(req.params[paramName]);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: `Invalid ${paramName} parameter` });
    }
    req.params[paramName] = id;
    next();
};

// Panel routes
app.get('/api/panels', asyncHandler(async (req, res) => {
    const panels = await dbAll('SELECT * FROM panels ORDER BY created_at DESC');
    res.json(panels);
}));

app.get('/api/panels/:id', validateId(), asyncHandler(async (req, res) => {
    const panel = await dbGet('SELECT * FROM panels WHERE id = ?', [req.params.id]);
    if (!panel) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    res.json(panel);
}));

app.post('/api/panels', asyncHandler(async (req, res) => {
    const { name, size } = req.body;
    
    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    }
    if (!size || typeof size !== 'number' || size < 12 || size > 42) {
        return res.status(400).json({ error: 'Size must be a number between 12 and 42' });
    }

    const result = await dbRun('INSERT INTO panels (name, size) VALUES (?, ?)', [name.trim(), size]);
    res.status(201).json({ id: result.id, name: name.trim(), size });
}));

app.put('/api/panels/:id', validateId(), asyncHandler(async (req, res) => {
    const { name, size } = req.body;
    
    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    }
    if (!size || typeof size !== 'number' || size < 12 || size > 42) {
        return res.status(400).json({ error: 'Size must be a number between 12 and 42' });
    }

    const result = await dbRun('UPDATE panels SET name = ?, size = ? WHERE id = ?', [name.trim(), size, req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    res.json({ id: req.params.id, name: name.trim(), size });
}));

app.delete('/api/panels/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM panels WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    res.json({ message: 'Panel deleted successfully' });
}));

// Breaker routes
app.get('/api/panels/:panelId/breakers', validateId('panelId'), asyncHandler(async (req, res) => {
    const breakers = await dbAll('SELECT * FROM breakers WHERE panel_id = ? ORDER BY position', [req.params.panelId]);
    res.json(breakers);
}));

app.get('/api/breakers/:id', validateId(), asyncHandler(async (req, res) => {
    const breaker = await dbGet('SELECT * FROM breakers WHERE id = ?', [req.params.id]);
    if (!breaker) {
        return res.status(404).json({ error: 'Breaker not found' });
    }
    res.json(breaker);
}));

app.get('/api/panels/:panelId/breakers/position/:position', asyncHandler(async (req, res) => {
    const panelId = parseInt(req.params.panelId);
    const position = parseInt(req.params.position);
    
    if (isNaN(panelId) || isNaN(position) || panelId <= 0 || position <= 0) {
        return res.status(400).json({ error: 'Invalid panel ID or position' });
    }

    const breaker = await dbGet('SELECT * FROM breakers WHERE panel_id = ? AND position = ?', [panelId, position]);
    res.json(breaker || null);
}));

app.post('/api/breakers', asyncHandler(async (req, res) => {
    const { panel_id, position, label, amperage, critical, monitor, double_pole } = req.body;
    
    // Validation
    if (!panel_id || typeof panel_id !== 'number' || panel_id <= 0) {
        return res.status(400).json({ error: 'Valid panel ID is required' });
    }
    if (!position || typeof position !== 'number' || position <= 0) {
        return res.status(400).json({ error: 'Valid position is required' });
    }
    if (amperage && (typeof amperage !== 'number' || amperage <= 0 || amperage > 200)) {
        return res.status(400).json({ error: 'Amperage must be between 1 and 200' });
    }

    const breakerData = {
        panel_id,
        position,
        label: label?.trim() || null,
        amperage: amperage || null,
        critical: Boolean(critical),
        monitor: Boolean(monitor),
        double_pole: Boolean(double_pole)
    };

    try {
        const result = await dbRun(
            `INSERT INTO breakers (panel_id, position, label, amperage, critical, monitor, double_pole) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [breakerData.panel_id, breakerData.position, breakerData.label, breakerData.amperage, 
             breakerData.critical, breakerData.monitor, breakerData.double_pole]
        );
        
        res.status(201).json({ id: result.id, ...breakerData });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A breaker already exists at this position' });
        }
        throw error;
    }
}));

app.put('/api/breakers/:id', validateId(), asyncHandler(async (req, res) => {
    const { label, amperage, critical, monitor, double_pole } = req.body;
    
    // Validation
    if (amperage && (typeof amperage !== 'number' || amperage <= 0 || amperage > 200)) {
        return res.status(400).json({ error: 'Amperage must be between 1 and 200' });
    }

    const breakerData = {
        label: label?.trim() || null,
        amperage: amperage || null,
        critical: Boolean(critical),
        monitor: Boolean(monitor),
        double_pole: Boolean(double_pole)
    };

    const result = await dbRun(
        `UPDATE breakers SET label = ?, amperage = ?, critical = ?, monitor = ?, double_pole = ? WHERE id = ?`,
        [breakerData.label, breakerData.amperage, breakerData.critical, breakerData.monitor, 
         breakerData.double_pole, req.params.id]
    );

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Breaker not found' });
    }
    res.json({ id: req.params.id, ...breakerData });
}));

app.delete('/api/breakers/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM breakers WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Breaker not found' });
    }
    res.json({ message: 'Breaker deleted successfully' });
}));

// Circuit routes
app.get('/api/circuits', asyncHandler(async (req, res) => {
    const circuits = await dbAll('SELECT * FROM circuits ORDER BY created_at');
    res.json(circuits);
}));

app.get('/api/breakers/:breakerId/circuits', validateId('breakerId'), asyncHandler(async (req, res) => {
    const circuits = await dbAll('SELECT * FROM circuits WHERE breaker_id = ? ORDER BY created_at', [req.params.breakerId]);
    res.json(circuits);
}));

app.post('/api/circuits', asyncHandler(async (req, res) => {
    const { breaker_id, room, type, notes, subpanel_id } = req.body;
    
    // Validation
    if (!breaker_id || typeof breaker_id !== 'number' || breaker_id <= 0) {
        return res.status(400).json({ error: 'Valid breaker ID is required' });
    }
    
    const validTypes = ['outlet', 'lighting', 'heating', 'appliance', 'subpanel'];
    if (type && !validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }

    if (subpanel_id && (typeof subpanel_id !== 'number' || subpanel_id <= 0)) {
        return res.status(400).json({ error: 'Subpanel ID must be a valid positive number' });
    }

    const circuitData = {
        breaker_id,
        room: room?.trim() || null,
        type: type || null,
        notes: notes?.trim() || null,
        subpanel_id: subpanel_id || null
    };

    const result = await dbRun(
        `INSERT INTO circuits (breaker_id, room, type, notes, subpanel_id) VALUES (?, ?, ?, ?, ?)`,
        [circuitData.breaker_id, circuitData.room, circuitData.type, circuitData.notes, circuitData.subpanel_id]
    );

    res.status(201).json({ id: result.id, ...circuitData });
}));

app.put('/api/circuits/:id', validateId(), asyncHandler(async (req, res) => {
    const { room, type, notes, subpanel_id } = req.body;
    
    // Validation
    const validTypes = ['outlet', 'lighting', 'heating', 'appliance', 'subpanel'];
    if (type && !validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }

    if (subpanel_id && (typeof subpanel_id !== 'number' || subpanel_id <= 0)) {
        return res.status(400).json({ error: 'Subpanel ID must be a valid positive number' });
    }

    const circuitData = {
        room: room?.trim() || null,
        type: type || null,
        notes: notes?.trim() || null,
        subpanel_id: subpanel_id || null
    };

    const result = await dbRun(
        `UPDATE circuits SET room = ?, type = ?, notes = ?, subpanel_id = ? WHERE id = ?`,
        [circuitData.room, circuitData.type, circuitData.notes, circuitData.subpanel_id, req.params.id]
    );

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Circuit not found' });
    }
    res.json({ id: req.params.id, ...circuitData });
}));

app.delete('/api/circuits/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM circuits WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Circuit not found' });
    }
    res.json({ message: 'Circuit deleted successfully' });
}));

// Static route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
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
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
            } else {
                console.log(`Connected to SQLite database: ${DB_PATH}`);
                initializeDatabase();
                resolve();
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

// Start server
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