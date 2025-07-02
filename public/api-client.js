/**
 * API Client for Breaker Panel Helper
 * Handles all communication with the server-side API
 */
class ApiClient {
    constructor() {
        this.baseUrl = '/api';
        this.defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    /**
     * Generic request handler with error handling and validation
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} API response
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...this.defaultOptions,
            ...options,
            headers: {
                ...this.defaultOptions.headers,
                ...options.headers,
            },
        };

        // Serialize body if it's an object
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            
            // Handle different response types
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                const error = new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.data = data;
                throw error;
            }

            return data;
        } catch (error) {
            // Re-throw with more context for network errors
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error: Unable to connect to server');
            }
            throw error;
        }
    }

    // Panel API methods
    async getAllPanels() {
        return this.request('/panels');
    }

    async getPanel(id) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid panel ID');
        }
        return this.request(`/panels/${id}`);
    }

    async createPanel(panelData) {
        this.validatePanelData(panelData);
        return this.request('/panels', {
            method: 'POST',
            body: panelData,
        });
    }

    async updatePanel(id, panelData) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid panel ID');
        }
        this.validatePanelData(panelData);
        return this.request(`/panels/${id}`, {
            method: 'PUT',
            body: panelData,
        });
    }

    async deletePanel(id) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid panel ID');
        }
        return this.request(`/panels/${id}`, {
            method: 'DELETE',
        });
    }

    // Breaker API methods
    async getBreakersByPanel(panelId) {
        if (!this.isValidId(panelId)) {
            throw new Error('Invalid panel ID');
        }
        return this.request(`/panels/${panelId}/breakers`);
    }

    async getBreaker(id) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid breaker ID');
        }
        return this.request(`/breakers/${id}`);
    }

    async getBreakerByPosition(panelId, position, queryParams = '') {
        if (!this.isValidId(panelId) || !this.isValidPosition(position)) {
            throw new Error('Invalid panel ID or position');
        }
        return this.request(`/panels/${panelId}/breakers/position/${position}${queryParams}`);
    }

    async createBreaker(breakerData) {
        this.validateBreakerData(breakerData);
        return this.request('/breakers', {
            method: 'POST',
            body: breakerData,
        });
    }

    async updateBreaker(id, breakerData) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid breaker ID');
        }
        this.validateBreakerData(breakerData, false); // Skip required field validation for updates
        return this.request(`/breakers/${id}`, {
            method: 'PUT',
            body: breakerData,
        });
    }

    async deleteBreaker(id) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid breaker ID');
        }
        return this.request(`/breakers/${id}`, {
            method: 'DELETE',
        });
    }

    // Room API methods
    async getAllRooms() {
        return this.request('/rooms');
    }

    async createRoom(roomData) {
        this.validateRoomData(roomData);
        return this.request('/rooms', {
            method: 'POST',
            body: roomData,
        });
    }

    async updateRoom(id, roomData) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid room ID');
        }
        this.validateRoomData(roomData);
        return this.request(`/rooms/${id}`, {
            method: 'PUT',
            body: roomData,
        });
    }

    async deleteRoom(id) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid room ID');
        }
        return this.request(`/rooms/${id}`, {
            method: 'DELETE',
        });
    }

    // Circuit API methods
    async getAllCircuits() {
        return this.request('/circuits');
    }

    async getCircuitsByBreaker(breakerId) {
        if (!this.isValidId(breakerId)) {
            throw new Error('Invalid breaker ID');
        }
        return this.request(`/breakers/${breakerId}/circuits`);
    }

    async createCircuit(circuitData) {
        this.validateCircuitData(circuitData);
        return this.request('/circuits', {
            method: 'POST',
            body: circuitData,
        });
    }

    async updateCircuit(id, circuitData) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid circuit ID');
        }
        this.validateCircuitData(circuitData, false); // Skip required field validation for updates
        return this.request(`/circuits/${id}`, {
            method: 'PUT',
            body: circuitData,
        });
    }

    async deleteCircuit(id) {
        if (!this.isValidId(id)) {
            throw new Error('Invalid circuit ID');
        }
        return this.request(`/circuits/${id}`, {
            method: 'DELETE',
        });
    }

    async moveCircuit(id, targetPanelId, targetPosition, targetSlotPosition = 'single') {
        if (!this.isValidId(id)) {
            throw new Error('Invalid circuit ID');
        }
        if (!this.isValidId(targetPanelId)) {
            throw new Error('Invalid target panel ID');
        }
        if (!this.isValidPosition(targetPosition)) {
            throw new Error('Invalid target position');
        }
        
        const validSlots = ['single', 'A', 'B'];
        if (!validSlots.includes(targetSlotPosition)) {
            throw new Error(`Target slot position must be one of: ${validSlots.join(', ')}`);
        }
        
        return this.request(`/circuits/${id}/move`, {
            method: 'PUT',
            body: {
                target_panel_id: targetPanelId,
                target_position: targetPosition,
                target_slot_position: targetSlotPosition
            },
        });
    }

    // Validation helpers
    isValidId(id) {
        const numId = typeof id === 'string' ? parseInt(id) : id;
        return Number.isInteger(numId) && numId > 0;
    }

    isValidPosition(position) {
        const numPos = typeof position === 'string' ? parseInt(position) : position;
        return Number.isInteger(numPos) && numPos > 0;
    }

    // Basic client-side validation - server handles comprehensive validation
    validatePanelData(data) {
        if (!data.name?.trim()) throw new Error('Panel name is required');
        if (!data.size) throw new Error('Panel size is required');
    }

    validateBreakerData(data, requireAll = true) {
        if (requireAll) {
            if (!this.isValidId(data.panel_id)) throw new Error('Valid panel ID is required');
            if (!this.isValidPosition(data.position)) throw new Error('Valid position is required');
        }
    }

    validateCircuitData(data, requireAll = true) {
        if (requireAll && !this.isValidId(data.breaker_id)) {
            throw new Error('Valid breaker ID is required');
        }
    }

    validateRoomData(data) {
        if (!data.name?.trim()) throw new Error('Room name is required');
        if (!data.level) throw new Error('Room level is required');
    }
}