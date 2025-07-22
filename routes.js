const express = require('express');
const router = express.Router();
const ErrorHandler = require('./services/error-handler');

// Import validation middleware
const {
    validateId,
    validatePanelData,
    validateBreakerData,
    validateRoomData,
    validateCircuitData
} = require('./middleware');

// Database service will be injected
let databaseService;

const setDatabaseService = (service) => {
    databaseService = service;
};

// Panel routes
router.get('/panels', ErrorHandler.asyncHandler(async (req, res) => {
    const panels = await databaseService.all('SELECT * FROM panels ORDER BY created_at DESC');
    res.json(panels);
}));

router.get('/panels/:id', validateId(), ErrorHandler.asyncHandler(async (req, res) => {
    const panel = await databaseService.get('SELECT * FROM panels WHERE id = ?', [req.params.id]);
    if (!panel) {
        const errorInfo = ErrorHandler.handleNotFoundError('Panel');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json(panel);
}));

router.post('/panels', validatePanelData, ErrorHandler.asyncHandler(async (req, res) => {
    const { name, size } = req.body;
    try {
        const result = await databaseService.run('INSERT INTO panels (name, size) VALUES (?, ?)', [name.trim(), size]);
        res.status(201).json({ id: result.id, name: name.trim(), size });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error);
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.put('/panels/:id', validateId(), validatePanelData, ErrorHandler.asyncHandler(async (req, res) => {
    const { name, size } = req.body;
    try {
        const result = await databaseService.run('UPDATE panels SET name = ?, size = ? WHERE id = ?', [name.trim(), size, req.params.id]);
        if (result.changes === 0) {
            const errorInfo = ErrorHandler.handleNotFoundError('Panel');
            return ErrorHandler.sendError(res, errorInfo);
        }
        res.json({ id: req.params.id, name: name.trim(), size });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error);
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.delete('/panels/:id', validateId(), ErrorHandler.asyncHandler(async (req, res) => {
    const result = await databaseService.run('DELETE FROM panels WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        const errorInfo = ErrorHandler.handleNotFoundError('Panel');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json({ message: 'Panel deleted successfully' });
}));

// Breaker routes
router.get('/panels/:panelId/breakers', validateId('panelId'), ErrorHandler.asyncHandler(async (req, res) => {
    const breakers = await databaseService.all('SELECT * FROM breakers WHERE panel_id = ? ORDER BY position', [req.params.panelId]);
    res.json(breakers);
}));

router.get('/breakers/:id', validateId(), ErrorHandler.asyncHandler(async (req, res) => {
    const breaker = await databaseService.get('SELECT * FROM breakers WHERE id = ?', [req.params.id]);
    if (!breaker) {
        const errorInfo = ErrorHandler.handleNotFoundError('Breaker');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json(breaker);
}));

router.get('/panels/:panelId/breakers/position/:position', ErrorHandler.asyncHandler(async (req, res) => {
    const panelId = parseInt(req.params.panelId);
    const position = parseInt(req.params.position);
    const slotPosition = req.query.slot_position || 'single';
    
    if (isNaN(panelId) || isNaN(position) || panelId <= 0 || position <= 0) {
        const errorInfo = ErrorHandler.handleValidationError('Invalid panel ID or position');
        return ErrorHandler.sendError(res, errorInfo);
    }

    // For tandem breakers, we might need to get both A and B breakers
    if (slotPosition === 'both') {
        const breakers = await databaseService.all('SELECT * FROM breakers WHERE panel_id = ? AND position = ? ORDER BY slot_position', [panelId, position]);
        res.json(breakers || []);
    } else {
        const breaker = await databaseService.get('SELECT * FROM breakers WHERE panel_id = ? AND position = ? AND slot_position = ?', [panelId, position, slotPosition]);
        res.json(breaker || null);
    }
}));

router.post('/breakers', validateBreakerData, ErrorHandler.asyncHandler(async (req, res) => {
    const breakerData = ErrorHandler.processBreakerData(req.body, 'create');

    try {
        const result = await databaseService.run(
            `INSERT INTO breakers (panel_id, position, label, amperage, critical, monitor, confirmed, breaker_type, slot_position) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [breakerData.panel_id, breakerData.position, breakerData.label, breakerData.amperage, 
             breakerData.critical, breakerData.monitor, breakerData.confirmed, breakerData.breaker_type,
             breakerData.slot_position]
        );
        
        res.status(201).json({ id: result.id, ...breakerData });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error, { field: 'panel_id' });
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.put('/breakers/:id', validateId(), validateBreakerData, ErrorHandler.asyncHandler(async (req, res) => {
    const breakerData = ErrorHandler.processBreakerData(req.body, 'update');

    try {
        const result = await databaseService.run(
            `UPDATE breakers SET label = ?, amperage = ?, critical = ?, monitor = ?, confirmed = ?, breaker_type = ?, slot_position = ? WHERE id = ?`,
            [breakerData.label, breakerData.amperage, breakerData.critical, breakerData.monitor, 
             breakerData.confirmed, breakerData.breaker_type, breakerData.slot_position, req.params.id]
        );

        if (result.changes === 0) {
            const errorInfo = ErrorHandler.handleNotFoundError('Breaker');
            return ErrorHandler.sendError(res, errorInfo);
        }
        res.json({ id: req.params.id, ...breakerData });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error);
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.delete('/breakers/:id', validateId(), ErrorHandler.asyncHandler(async (req, res) => {
    const result = await databaseService.run('DELETE FROM breakers WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        const errorInfo = ErrorHandler.handleNotFoundError('Breaker');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json({ message: 'Breaker deleted successfully' });
}));

// Move breaker endpoint
router.post('/breakers/move', ErrorHandler.asyncHandler(async (req, res) => {
    const {
        sourceBreakerId,
        destinationPanelId,
        destinationPosition,
        destinationSlot
    } = req.body;

    // Validate required fields
    if (!sourceBreakerId || !destinationPanelId || !destinationPosition) {
        const errorInfo = ErrorHandler.handleValidationError('Missing required fields');
        return ErrorHandler.sendError(res, errorInfo);
    }

    try {
        // Check source breaker exists first (outside transaction)
        const sourceBreaker = await databaseService.get('SELECT * FROM breakers WHERE id = ?', [sourceBreakerId]);
        if (!sourceBreaker) {
            const errorInfo = ErrorHandler.handleNotFoundError('Source breaker');
            return ErrorHandler.sendError(res, errorInfo);
        }

        await databaseService.transaction(async (db) => {
            const sourceCircuits = await db.all(
                'SELECT * FROM circuits WHERE breaker_id = ?', 
                [sourceBreakerId]
            );

            // Check if destination position is occupied
            let destinationBreaker = await db.get(
                'SELECT * FROM breakers WHERE panel_id = ? AND position = ? AND slot_position = ?', 
                [destinationPanelId, destinationPosition, destinationSlot || 'single']
            );

            let destinationCircuits = [];
            if (destinationBreaker) {
                destinationCircuits = await db.all(
                    'SELECT * FROM circuits WHERE breaker_id = ?', 
                    [destinationBreaker.id]
                );
            }

            if (destinationBreaker) {
                // Swap circuits between existing breakers
                for (const circuit of sourceCircuits) {
                    await db.run(
                        'UPDATE circuits SET breaker_id = ? WHERE id = ?',
                        [destinationBreaker.id, circuit.id]
                    );
                }
                
                for (const circuit of destinationCircuits) {
                    await db.run(
                        'UPDATE circuits SET breaker_id = ? WHERE id = ?',
                        [sourceBreakerId, circuit.id]
                    );
                }
            } else {
                // Create new breaker at destination and move circuits there
                const newBreaker = await db.run(
                    `INSERT INTO breakers (panel_id, position, slot_position, label, amperage, critical, monitor, confirmed, breaker_type) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        destinationPanelId,
                        destinationPosition,
                        destinationSlot || 'single',
                        '', // Empty label - will be auto-generated from circuits
                        sourceBreaker.amperage,
                        sourceBreaker.critical,
                        sourceBreaker.monitor,
                        sourceBreaker.confirmed,
                        sourceBreaker.breaker_type
                    ]
                );
                
                // Move circuits to new breaker
                for (const circuit of sourceCircuits) {
                    await db.run(
                        'UPDATE circuits SET breaker_id = ? WHERE id = ?',
                        [newBreaker.id, circuit.id]
                    );
                }
            }

            // Check if source breaker still has circuits after the move
            const remainingCircuits = await db.all(
                'SELECT * FROM circuits WHERE breaker_id = ?', 
                [sourceBreakerId]
            );

            if (remainingCircuits.length === 0) {
                // Delete empty source breaker
                await db.run('DELETE FROM breakers WHERE id = ?', [sourceBreakerId]);
            }
        });

        res.json({ 
            message: 'Breaker moved successfully'
        });

    } catch (error) {
        console.error('Move breaker error:', error);
        const errorInfo = ErrorHandler.handleDatabaseError(error, { operation: 'move' });
        ErrorHandler.sendError(res, errorInfo);
    }
}));

// Room routes
router.get('/rooms', ErrorHandler.asyncHandler(async (req, res) => {
    const rooms = await databaseService.all(`
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

router.post('/rooms', validateRoomData, ErrorHandler.asyncHandler(async (req, res) => {
    const { name, level } = req.body;
    try {
        const result = await databaseService.run('INSERT INTO rooms (name, level) VALUES (?, ?)', [name.trim(), level]);
        res.status(201).json({ id: result.id, name: name.trim(), level });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error);
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.put('/rooms/:id', validateId(), validateRoomData, ErrorHandler.asyncHandler(async (req, res) => {
    const { name, level } = req.body;
    try {
        const result = await databaseService.run('UPDATE rooms SET name = ?, level = ? WHERE id = ?', [name.trim(), level, req.params.id]);
        if (result.changes === 0) {
            const errorInfo = ErrorHandler.handleNotFoundError('Room');
            return ErrorHandler.sendError(res, errorInfo);
        }
        res.json({ id: req.params.id, name: name.trim(), level });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error);
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.delete('/rooms/:id', validateId(), ErrorHandler.asyncHandler(async (req, res) => {
    const result = await databaseService.run('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        const errorInfo = ErrorHandler.handleNotFoundError('Room');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json({ message: 'Room deleted successfully' });
}));

// Circuit routes
router.get('/circuits', ErrorHandler.asyncHandler(async (req, res) => {
    const circuits = await databaseService.all(`
        SELECT c.*, r.name as room_name, r.level as room_level 
        FROM circuits c 
        LEFT JOIN rooms r ON c.room_id = r.id 
        ORDER BY c.created_at
    `);
    res.json(circuits);
}));

router.get('/breakers/:breakerId/circuits', validateId('breakerId'), ErrorHandler.asyncHandler(async (req, res) => {
    const circuits = await databaseService.all(`
        SELECT c.*, r.name as room_name, r.level as room_level 
        FROM circuits c 
        LEFT JOIN rooms r ON c.room_id = r.id 
        WHERE c.breaker_id = ? 
        ORDER BY c.created_at
    `, [req.params.breakerId]);
    res.json(circuits);
}));

router.post('/circuits', validateCircuitData, ErrorHandler.asyncHandler(async (req, res) => {
    const circuitData = ErrorHandler.processCircuitData(req.body, 'create');

    try {
        const result = await databaseService.run(
            `INSERT INTO circuits (breaker_id, room_id, type, notes, subpanel_id) VALUES (?, ?, ?, ?, ?)`,
            [circuitData.breaker_id, circuitData.room_id, circuitData.type, circuitData.notes, circuitData.subpanel_id]
        );

        res.status(201).json({ id: result.id, ...circuitData });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error, { field: 'breaker_id' });
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.put('/circuits/:id', validateId(), validateCircuitData, ErrorHandler.asyncHandler(async (req, res) => {
    const circuitData = ErrorHandler.processCircuitData(req.body, 'update');

    const result = await databaseService.run(
        `UPDATE circuits SET room_id = ?, type = ?, notes = ?, subpanel_id = ? WHERE id = ?`,
        [circuitData.room_id, circuitData.type, circuitData.notes, circuitData.subpanel_id, req.params.id]
    );

    if (result.changes === 0) {
        const errorInfo = ErrorHandler.handleNotFoundError('Circuit');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json({ id: req.params.id, ...circuitData });
}));

router.delete('/circuits/:id', validateId(), ErrorHandler.asyncHandler(async (req, res) => {
    const result = await databaseService.run('DELETE FROM circuits WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
        const errorInfo = ErrorHandler.handleNotFoundError('Circuit');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json({ message: 'Circuit deleted successfully' });
}));


module.exports = { router, setDatabaseService };