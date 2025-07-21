const express = require('express');
const router = express.Router();

// Import validation middleware
const {
    validateId,
    validatePanelData,
    validateBreakerData,
    validateRoomData,
    validateCircuitData,
    asyncHandler
} = require('./middleware');

// Database helper functions will be injected
let dbGet, dbAll, dbRun;

const setDbHelpers = (helpers) => {
    dbGet = helpers.dbGet;
    dbAll = helpers.dbAll;
    dbRun = helpers.dbRun;
};

// Panel routes
router.get('/panels', asyncHandler(async (req, res) => {
    const panels = await dbAll('SELECT * FROM panels ORDER BY created_at DESC');
    res.json(panels);
}));

router.get('/panels/:id', validateId(), asyncHandler(async (req, res) => {
    const panel = await dbGet('SELECT * FROM panels WHERE id = ?', [req.params.id]);
    if (!panel) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    res.json(panel);
}));

router.post('/panels', validatePanelData, asyncHandler(async (req, res) => {
    const { name, size } = req.body;
    const result = await dbRun('INSERT INTO panels (name, size) VALUES (?, ?)', [name.trim(), size]);
    res.status(201).json({ id: result.id, name: name.trim(), size });
}));

router.put('/panels/:id', validateId(), validatePanelData, asyncHandler(async (req, res) => {
    const { name, size } = req.body;
    const result = await dbRun('UPDATE panels SET name = ?, size = ? WHERE id = ?', [name.trim(), size, req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    res.json({ id: req.params.id, name: name.trim(), size });
}));

router.delete('/panels/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM panels WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    res.json({ message: 'Panel deleted successfully' });
}));

// Breaker routes
router.get('/panels/:panelId/breakers', validateId('panelId'), asyncHandler(async (req, res) => {
    const breakers = await dbAll('SELECT * FROM breakers WHERE panel_id = ? ORDER BY position', [req.params.panelId]);
    res.json(breakers);
}));

router.get('/breakers/:id', validateId(), asyncHandler(async (req, res) => {
    const breaker = await dbGet('SELECT * FROM breakers WHERE id = ?', [req.params.id]);
    if (!breaker) {
        return res.status(404).json({ error: 'Breaker not found' });
    }
    res.json(breaker);
}));

router.get('/panels/:panelId/breakers/position/:position', asyncHandler(async (req, res) => {
    const panelId = parseInt(req.params.panelId);
    const position = parseInt(req.params.position);
    const slotPosition = req.query.slot_position || 'single';
    
    if (isNaN(panelId) || isNaN(position) || panelId <= 0 || position <= 0) {
        return res.status(400).json({ error: 'Invalid panel ID or position' });
    }

    // For tandem breakers, we might need to get both A and B breakers
    if (slotPosition === 'both') {
        const breakers = await dbAll('SELECT * FROM breakers WHERE panel_id = ? AND position = ? ORDER BY slot_position', [panelId, position]);
        res.json(breakers || []);
    } else {
        const breaker = await dbGet('SELECT * FROM breakers WHERE panel_id = ? AND position = ? AND slot_position = ?', [panelId, position, slotPosition]);
        res.json(breaker || null);
    }
}));

router.post('/breakers', validateBreakerData, asyncHandler(async (req, res) => {
    const { panel_id, position, label, amperage, critical, monitor, confirmed, breaker_type, slot_position } = req.body;
    
    // For tandem breakers, ensure slot_position is set appropriately
    let finalSlotPosition = slot_position || 'single';
    let finalBreakerType = breaker_type || 'single';
    if (finalBreakerType === 'tandem' && finalSlotPosition === 'single') {
        finalSlotPosition = 'A';
    }

    const breakerData = {
        panel_id,
        position,
        label: label?.trim() || null,
        amperage: amperage || null,
        critical: Boolean(critical),
        monitor: Boolean(monitor),
        confirmed: Boolean(confirmed),
        breaker_type: finalBreakerType,
        slot_position: finalSlotPosition
    };

    try {
        const result = await dbRun(
            `INSERT INTO breakers (panel_id, position, label, amperage, critical, monitor, confirmed, breaker_type, slot_position) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [breakerData.panel_id, breakerData.position, breakerData.label, breakerData.amperage, 
             breakerData.critical, breakerData.monitor, breakerData.confirmed, breakerData.breaker_type,
             breakerData.slot_position]
        );
        
        res.status(201).json({ id: result.id, ...breakerData });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A breaker already exists at this position and slot' });
        } else if (error.message.includes('FOREIGN KEY constraint failed')) {
            return res.status(400).json({ error: 'Invalid panel_id - panel does not exist' });
        }
        throw error;
    }
}));

router.put('/breakers/:id', validateId(), validateBreakerData, asyncHandler(async (req, res) => {
    const { label, amperage, critical, monitor, confirmed, breaker_type, slot_position } = req.body;

    // For tandem breakers, ensure slot_position is set appropriately
    let finalSlotPosition = slot_position || 'single';
    let finalBreakerType = breaker_type || 'single';
    if (finalBreakerType === 'tandem' && finalSlotPosition === 'single') {
        finalSlotPosition = 'A'; // Default to A for tandem breakers
    }

    const breakerData = {
        label: label?.trim() || null,
        amperage: amperage || null,
        critical: Boolean(critical),
        monitor: Boolean(monitor),
        confirmed: Boolean(confirmed),
        breaker_type: finalBreakerType,
        slot_position: finalSlotPosition
    };

    try {
        const result = await dbRun(
            `UPDATE breakers SET label = ?, amperage = ?, critical = ?, monitor = ?, confirmed = ?, breaker_type = ?, slot_position = ? WHERE id = ?`,
            [breakerData.label, breakerData.amperage, breakerData.critical, breakerData.monitor, 
             breakerData.confirmed, breakerData.breaker_type, breakerData.slot_position, req.params.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Breaker not found' });
        }
        res.json({ id: req.params.id, ...breakerData });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A breaker already exists at this position and slot' });
        }
        throw error;
    }
}));

router.delete('/breakers/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM breakers WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Breaker not found' });
    }
    res.json({ message: 'Breaker deleted successfully' });
}));

// Room routes
router.get('/rooms', asyncHandler(async (req, res) => {
    const rooms = await dbAll(`
        SELECT * FROM rooms 
        ORDER BY 
            CASE level 
                WHEN 'upper' THEN 1 
                WHEN 'main' THEN 2 
                WHEN 'basement' THEN 3 
                WHEN 'outside' THEN 4 
            END, 
            name
    `);
    res.json(rooms);
}));

router.post('/rooms', validateRoomData, asyncHandler(async (req, res) => {
    const { name, level } = req.body;
    try {
        const result = await dbRun('INSERT INTO rooms (name, level) VALUES (?, ?)', [name.trim(), level]);
        res.status(201).json({ id: result.id, name: name.trim(), level });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A room with this name already exists' });
        }
        throw error;
    }
}));

router.put('/rooms/:id', validateId(), validateRoomData, asyncHandler(async (req, res) => {
    const { name, level } = req.body;
    try {
        const result = await dbRun('UPDATE rooms SET name = ?, level = ? WHERE id = ?', [name.trim(), level, req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        res.json({ id: req.params.id, name: name.trim(), level });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A room with this name already exists' });
        }
        throw error;
    }
}));

router.delete('/rooms/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ message: 'Room deleted successfully' });
}));

// Circuit routes
router.get('/circuits', asyncHandler(async (req, res) => {
    const circuits = await dbAll(`
        SELECT c.*, r.name as room_name, r.level as room_level 
        FROM circuits c 
        LEFT JOIN rooms r ON c.room_id = r.id 
        ORDER BY c.created_at
    `);
    res.json(circuits);
}));

router.get('/breakers/:breakerId/circuits', validateId('breakerId'), asyncHandler(async (req, res) => {
    const circuits = await dbAll(`
        SELECT c.*, r.name as room_name, r.level as room_level 
        FROM circuits c 
        LEFT JOIN rooms r ON c.room_id = r.id 
        WHERE c.breaker_id = ? 
        ORDER BY c.created_at
    `, [req.params.breakerId]);
    res.json(circuits);
}));

router.post('/circuits', validateCircuitData, asyncHandler(async (req, res) => {
    const { breaker_id, room_id, type, notes, subpanel_id } = req.body;

    const circuitData = {
        breaker_id,
        room_id: room_id || null,
        type: type || null,
        notes: notes?.trim() || null,
        subpanel_id: subpanel_id || null
    };

    try {
        const result = await dbRun(
            `INSERT INTO circuits (breaker_id, room_id, type, notes, subpanel_id) VALUES (?, ?, ?, ?, ?)`,
            [circuitData.breaker_id, circuitData.room_id, circuitData.type, circuitData.notes, circuitData.subpanel_id]
        );

        res.status(201).json({ id: result.id, ...circuitData });
    } catch (error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            if (error.message.includes('breaker_id')) {
                return res.status(400).json({ error: 'Invalid breaker_id - breaker does not exist' });
            } else if (error.message.includes('room_id')) {
                return res.status(400).json({ error: 'Invalid room_id - room does not exist' });
            } else if (error.message.includes('subpanel_id')) {
                return res.status(400).json({ error: 'Invalid subpanel_id - subpanel does not exist' });
            } else {
                return res.status(400).json({ error: 'Foreign key constraint violation' });
            }
        }
        throw error;
    }
}));

router.put('/circuits/:id', validateId(), validateCircuitData, asyncHandler(async (req, res) => {
    const { room_id, type, notes, subpanel_id } = req.body;

    const circuitData = {
        room_id: room_id || null,
        type: type || null,
        notes: notes?.trim() || null,
        subpanel_id: subpanel_id || null
    };

    const result = await dbRun(
        `UPDATE circuits SET room_id = ?, type = ?, notes = ?, subpanel_id = ? WHERE id = ?`,
        [circuitData.room_id, circuitData.type, circuitData.notes, circuitData.subpanel_id, req.params.id]
    );

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Circuit not found' });
    }
    res.json({ id: req.params.id, ...circuitData });
}));

router.delete('/circuits/:id', validateId(), asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM circuits WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Circuit not found' });
    }
    res.json({ message: 'Circuit deleted successfully' });
}));


module.exports = { router, setDbHelpers };