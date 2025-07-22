// Note: asyncHandler moved to ErrorHandler utility class

const validateId = (paramName = 'id') => (req, res, next) => {
    const id = parseInt(req.params[paramName]);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: `Invalid ${paramName} parameter` });
    }
    req.params[paramName] = id;
    next();
};

// Validation middleware
const validatePanelData = (req, res, next) => {
    const { name, size } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    }
    if (!size || typeof size !== 'number' || size < 12 || size > 42) {
        return res.status(400).json({ error: 'Size must be a number between 12 and 42' });
    }
    next();
};

const validateBreakerData = (req, res, next) => {
    const { panel_id, position, amperage, slot_position, breaker_type } = req.body;
    
    if (req.method === 'POST') {
        if (!panel_id || typeof panel_id !== 'number' || panel_id <= 0) {
            return res.status(400).json({ error: 'Valid panel ID is required' });
        }
        if (!position || typeof position !== 'number' || position <= 0) {
            return res.status(400).json({ error: 'Valid position is required' });
        }
    }
    
    if (amperage !== null && amperage !== undefined && (typeof amperage !== 'number' || amperage <= 0 || amperage > 200)) {
        return res.status(400).json({ error: 'Amperage must be between 1 and 200' });
    }
    if (slot_position && !['single', 'A', 'B'].includes(slot_position)) {
        return res.status(400).json({ error: 'Slot position must be one of: single, A, B' });
    }
    if (breaker_type && !['single', 'double_pole', 'tandem'].includes(breaker_type)) {
        return res.status(400).json({ error: 'Breaker type must be one of: single, double_pole, tandem' });
    }
    next();
};

const validateRoomData = (req, res, next) => {
    const { name, level } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Room name is required and must be a non-empty string' });
    }
    if (!level || !['basement', 'main', 'upper', 'outside'].includes(level)) {
        return res.status(400).json({ error: 'Level must be one of: basement, main, upper, outside' });
    }
    next();
};

const validateCircuitData = (req, res, next) => {
    const { breaker_id, type, room_id, subpanel_id } = req.body;
    
    if (req.method === 'POST' && (!breaker_id || typeof breaker_id !== 'number' || breaker_id <= 0)) {
        return res.status(400).json({ error: 'Valid breaker ID is required' });
    }
    
    const validTypes = ['outlet', 'lighting', 'heating', 'appliance', 'subpanel'];
    if (type && !validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }
    if (room_id && (typeof room_id !== 'number' || room_id <= 0)) {
        return res.status(400).json({ error: 'Room ID must be a valid positive number' });
    }
    if (subpanel_id && (typeof subpanel_id !== 'number' || subpanel_id <= 0)) {
        return res.status(400).json({ error: 'Subpanel ID must be a valid positive number' });
    }
    next();
};

module.exports = {
    validateId,
    validatePanelData,
    validateBreakerData,
    validateRoomData,
    validateCircuitData
};