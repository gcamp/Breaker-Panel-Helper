const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Import the app
const app = require('../server.js');

describe('Breaker Panel API Tests', () => {
    let testDb;
    const TEST_DB_PATH = 'test_api.db';

    beforeAll(async () => {
        // Set up test database
        process.env.DB_PATH = TEST_DB_PATH;
        
        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        
        // Wait a bit for server to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterAll(async () => {
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    describe('Panel Management', () => {
        let panelId;

        test('POST /api/panels - Create new panel', async () => {
            const newPanel = {
                name: 'Test Main Panel',
                size: 40
            };

            const response = await request(app)
                .post('/api/panels')
                .send(newPanel)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(newPanel.name);
            expect(response.body.size).toBe(newPanel.size);
            
            panelId = response.body.id;
        });

        test('GET /api/panels - Get all panels', async () => {
            const response = await request(app)
                .get('/api/panels')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('id');
            expect(response.body[0]).toHaveProperty('name');
            expect(response.body[0]).toHaveProperty('size');
        });

        test('GET /api/panels/:id - Get specific panel', async () => {
            const response = await request(app)
                .get(`/api/panels/${panelId}`)
                .expect(200);

            expect(response.body.id).toBe(panelId);
            expect(response.body.name).toBe('Test Main Panel');
            expect(response.body.size).toBe(40);
        });

        test('PUT /api/panels/:id - Update panel', async () => {
            const updatedPanel = {
                name: 'Updated Main Panel',
                size: 42
            };

            const response = await request(app)
                .put(`/api/panels/${panelId}`)
                .send(updatedPanel)
                .expect(200);

            expect(response.body.name).toBe(updatedPanel.name);
            expect(response.body.size).toBe(updatedPanel.size);
        });

        test('POST /api/panels - Validation errors', async () => {
            // Missing name
            await request(app)
                .post('/api/panels')
                .send({ size: 40 })
                .expect(400);

            // Invalid size
            await request(app)
                .post('/api/panels')
                .send({ name: 'Test', size: 50 })
                .expect(400);

            // Empty name
            await request(app)
                .post('/api/panels')
                .send({ name: '', size: 40 })
                .expect(400);
        });
    });

    describe('Breaker Management', () => {
        let panelId;
        let breakerId;

        beforeAll(async () => {
            // Create a test panel first
            const panelResponse = await request(app)
                .post('/api/panels')
                .send({ name: 'Breaker Test Panel', size: 20 });
            panelId = panelResponse.body.id;
        });

        test('POST /api/breakers - Create single breaker', async () => {
            const newBreaker = {
                panel_id: panelId,
                position: 1,
                label: 'Kitchen Outlets',
                amperage: 20,
                critical: false,
                monitor: true,
                confirmed: false,
                double_pole: false,
                tandem: false,
                slot_position: 'single'
            };

            const response = await request(app)
                .post('/api/breakers')
                .send(newBreaker)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.label).toBe(newBreaker.label);
            expect(response.body.amperage).toBe(newBreaker.amperage);
            expect(response.body.tandem).toBe(false);
            expect(response.body.slot_position).toBe('single');
            
            breakerId = response.body.id;
        });

        test('POST /api/breakers - Create tandem breakers', async () => {
            const tandemBreakerA = {
                panel_id: panelId,
                position: 3,
                label: 'Bedroom Outlets A',
                amperage: 15,
                critical: false,
                monitor: false,
                confirmed: false,
                double_pole: false,
                tandem: true,
                slot_position: 'A'
            };

            const tandemBreakerB = {
                panel_id: panelId,
                position: 3,
                label: 'Bedroom Outlets B',
                amperage: 15,
                critical: false,
                monitor: false,
                confirmed: false,
                double_pole: false,
                tandem: true,
                slot_position: 'B'
            };

            // Create first tandem breaker
            const responseA = await request(app)
                .post('/api/breakers')
                .send(tandemBreakerA)
                .expect(201);

            expect(responseA.body.tandem).toBe(true);
            expect(responseA.body.slot_position).toBe('A');

            // Create second tandem breaker at same position
            const responseB = await request(app)
                .post('/api/breakers')
                .send(tandemBreakerB)
                .expect(201);

            expect(responseB.body.tandem).toBe(true);
            expect(responseB.body.slot_position).toBe('B');
        });

        test('POST /api/breakers - Create double pole breaker', async () => {
            const doublePoleBreaker = {
                panel_id: panelId,
                position: 5,
                label: 'Central AC Unit',
                amperage: 40,
                critical: true,
                monitor: true,
                confirmed: true,
                double_pole: true,
                tandem: false,
                slot_position: 'single'
            };

            const response = await request(app)
                .post('/api/breakers')
                .send(doublePoleBreaker)
                .expect(201);

            expect(response.body.double_pole).toBe(true);
            expect(response.body.critical).toBe(true);
            expect(response.body.confirmed).toBe(true);
        });

        test('GET /api/panels/:panelId/breakers - Get breakers by panel', async () => {
            const response = await request(app)
                .get(`/api/panels/${panelId}/breakers`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(4); // 1 single + 2 tandem + 1 double pole
        });

        test('GET /api/panels/:panelId/breakers/position/:position - Get breaker by position', async () => {
            // Test single breaker
            const singleResponse = await request(app)
                .get(`/api/panels/${panelId}/breakers/position/1`)
                .expect(200);

            expect(singleResponse.body).toHaveProperty('id');
            expect(singleResponse.body.position).toBe(1);

            // Test tandem breakers
            const tandemResponseA = await request(app)
                .get(`/api/panels/${panelId}/breakers/position/3?slot_position=A`)
                .expect(200);

            expect(tandemResponseA.body.slot_position).toBe('A');

            const tandemResponseB = await request(app)
                .get(`/api/panels/${panelId}/breakers/position/3?slot_position=B`)
                .expect(200);

            expect(tandemResponseB.body.slot_position).toBe('B');
        });

        test('PUT /api/breakers/:id - Update breaker', async () => {
            const updatedBreaker = {
                label: 'Updated Kitchen Outlets',
                amperage: 25,
                critical: true,
                monitor: false,
                confirmed: true,
                double_pole: false,
                tandem: false,
                slot_position: 'single'
            };

            const response = await request(app)
                .put(`/api/breakers/${breakerId}`)
                .send(updatedBreaker)
                .expect(200);

            expect(response.body.label).toBe(updatedBreaker.label);
            expect(response.body.amperage).toBe(updatedBreaker.amperage);
            expect(response.body.critical).toBe(true);
            expect(response.body.confirmed).toBe(true);
        });

        test('POST /api/breakers - Validation errors', async () => {
            // Missing panel_id
            await request(app)
                .post('/api/breakers')
                .send({ position: 1 })
                .expect(400);

            // Invalid amperage
            await request(app)
                .post('/api/breakers')
                .send({ panel_id: panelId, position: 1, amperage: 250 })
                .expect(400);

            // Invalid slot_position
            await request(app)
                .post('/api/breakers')
                .send({ 
                    panel_id: panelId, 
                    position: 1, 
                    slot_position: 'invalid' 
                })
                .expect(400);
        });

        test('DELETE /api/breakers/:id - Delete breaker', async () => {
            await request(app)
                .delete(`/api/breakers/${breakerId}`)
                .expect(200);

            // Verify deletion
            await request(app)
                .get(`/api/breakers/${breakerId}`)
                .expect(404);
        });
    });

    describe('Room Management', () => {
        let roomId;

        test('POST /api/rooms - Create room', async () => {
            const newRoom = {
                name: 'Test Kitchen',
                level: 'main'
            };

            const response = await request(app)
                .post('/api/rooms')
                .send(newRoom)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(newRoom.name);
            expect(response.body.level).toBe(newRoom.level);
            
            roomId = response.body.id;
        });

        test('GET /api/rooms - Get all rooms', async () => {
            // Create additional rooms for testing
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Basement Workshop', level: 'basement' });
            
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Master Bedroom', level: 'upper' });

            const response = await request(app)
                .get('/api/rooms')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(3);
            
            // Verify ordering: upper, main, basement
            expect(response.body[0].level).toBe('upper');
            expect(response.body[1].level).toBe('main');
            expect(response.body[2].level).toBe('basement');
        });

        test('PUT /api/rooms/:id - Update room', async () => {
            const updatedRoom = {
                name: 'Updated Kitchen',
                level: 'main'
            };

            const response = await request(app)
                .put(`/api/rooms/${roomId}`)
                .send(updatedRoom)
                .expect(200);

            expect(response.body.name).toBe(updatedRoom.name);
        });

        test('POST /api/rooms - Validation errors', async () => {
            // Missing name
            await request(app)
                .post('/api/rooms')
                .send({ level: 'main' })
                .expect(400);

            // Invalid level
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Test Room', level: 'invalid' })
                .expect(400);

            // Duplicate name
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Updated Kitchen', level: 'main' })
                .expect(409);
        });

        test('DELETE /api/rooms/:id - Delete room', async () => {
            await request(app)
                .delete(`/api/rooms/${roomId}`)
                .expect(200);

            // Verify deletion
            const response = await request(app)
                .get('/api/rooms');
            
            const deletedRoom = response.body.find(room => room.id === roomId);
            expect(deletedRoom).toBeUndefined();
        });
    });

    describe('Circuit Management', () => {
        let panelId;
        let breakerId;
        let roomId;
        let circuitId;

        beforeAll(async () => {
            // Create test panel
            const panelResponse = await request(app)
                .post('/api/panels')
                .send({ name: 'Circuit Test Panel', size: 20 });
            panelId = panelResponse.body.id;

            // Create test breaker
            const breakerResponse = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: panelId,
                    position: 1,
                    label: 'Test Breaker'
                });
            breakerId = breakerResponse.body.id;

            // Create test room
            const roomResponse = await request(app)
                .post('/api/rooms')
                .send({ name: 'Circuit Test Room', level: 'main' });
            roomId = roomResponse.body.id;
        });

        test('POST /api/circuits - Create circuit', async () => {
            const newCircuit = {
                breaker_id: breakerId,
                room_id: roomId,
                type: 'outlet',
                notes: 'Test outlet circuit'
            };

            const response = await request(app)
                .post('/api/circuits')
                .send(newCircuit)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.breaker_id).toBe(breakerId);
            expect(response.body.room_id).toBe(roomId);
            expect(response.body.type).toBe('outlet');
            
            circuitId = response.body.id;
        });

        test('GET /api/circuits - Get all circuits', async () => {
            const response = await request(app)
                .get('/api/circuits')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('room_name');
            expect(response.body[0]).toHaveProperty('room_level');
        });

        test('GET /api/breakers/:breakerId/circuits - Get circuits by breaker', async () => {
            const response = await request(app)
                .get(`/api/breakers/${breakerId}/circuits`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1);
            expect(response.body[0].breaker_id).toBe(breakerId);
        });

        test('POST /api/circuits - Create subpanel circuit', async () => {
            // Create subpanel
            const subpanelResponse = await request(app)
                .post('/api/panels')
                .send({ name: 'Test Subpanel', size: 12 });
            
            const subpanelId = subpanelResponse.body.id;

            // Create double pole breaker for subpanel
            const subpanelBreakerResponse = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: panelId,
                    position: 3,
                    label: 'Subpanel Feed',
                    double_pole: true
                });

            const subpanelBreakerId = subpanelBreakerResponse.body.id;

            // Create subpanel circuit
            const subpanelCircuit = {
                breaker_id: subpanelBreakerId,
                room_id: roomId,
                type: 'subpanel',
                notes: 'Feed to test subpanel',
                subpanel_id: subpanelId
            };

            const response = await request(app)
                .post('/api/circuits')
                .send(subpanelCircuit)
                .expect(201);

            expect(response.body.type).toBe('subpanel');
            expect(response.body.subpanel_id).toBe(subpanelId);
        });

        test('PUT /api/circuits/:id - Update circuit', async () => {
            const updatedCircuit = {
                room_id: roomId,
                type: 'lighting',
                notes: 'Updated to lighting circuit'
            };

            const response = await request(app)
                .put(`/api/circuits/${circuitId}`)
                .send(updatedCircuit)
                .expect(200);

            expect(response.body.type).toBe('lighting');
            expect(response.body.notes).toBe('Updated to lighting circuit');
        });

        test('POST /api/circuits - Validation errors', async () => {
            // Missing breaker_id
            await request(app)
                .post('/api/circuits')
                .send({ type: 'outlet' })
                .expect(400);

            // Invalid type
            await request(app)
                .post('/api/circuits')
                .send({ 
                    breaker_id: breakerId, 
                    type: 'invalid_type' 
                })
                .expect(400);
        });

        test('DELETE /api/circuits/:id - Delete circuit', async () => {
            await request(app)
                .delete(`/api/circuits/${circuitId}`)
                .expect(200);

            // Verify deletion
            const response = await request(app)
                .get(`/api/breakers/${breakerId}/circuits`);
            
            const deletedCircuit = response.body.find(circuit => circuit.id === circuitId);
            expect(deletedCircuit).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        test('GET /api/panels/999 - Non-existent panel', async () => {
            await request(app)
                .get('/api/panels/999')
                .expect(404);
        });

        test('GET /api/panels/invalid - Invalid ID format', async () => {
            await request(app)
                .get('/api/panels/invalid')
                .expect(400);
        });

        test('GET /api/nonexistent - Non-existent endpoint', async () => {
            await request(app)
                .get('/api/nonexistent')
                .expect(404);
        });
    });
});