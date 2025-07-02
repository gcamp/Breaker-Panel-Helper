const request = require('supertest');
const fs = require('fs');

// Import the app
const app = require('../server.js');

describe('Performance Tests', () => {
    const TEST_DB_PATH = 'test_performance.db';

    beforeAll(async () => {
        // Set up test database
        process.env.DB_PATH = TEST_DB_PATH;
        
        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        
        // Wait for server to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterAll(async () => {
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    describe('Database Performance', () => {
        let panelId;
        const LARGE_DATASET_SIZE = 1000;

        beforeAll(async () => {
            // Create a test panel
            const panel = await request(app)
                .post('/api/panels')
                .send({ name: 'Performance Test Panel', size: 42 });
            panelId = panel.body.id;
        });

        test('should handle large number of breaker creations efficiently', async () => {
            const start = Date.now();
            const promises = [];

            // Create many breakers in parallel
            for (let i = 1; i <= Math.min(LARGE_DATASET_SIZE, 42); i++) {
                promises.push(
                    request(app)
                        .post('/api/breakers')
                        .send({
                            panel_id: panelId,
                            position: i,
                            label: `Performance Breaker ${i}`,
                            amperage: 15 + (i % 4) * 5
                        })
                );
            }

            const responses = await Promise.all(promises);
            const duration = Date.now() - start;

            // All should succeed
            responses.forEach(response => {
                expect(response.status).toBe(201);
            });

            // Performance benchmark (adjust as needed)
            expect(duration).toBeLessThan(10000); // 10 seconds max
            console.log(`✓ Created ${responses.length} breakers in ${duration}ms (${(duration/responses.length).toFixed(2)}ms/breaker)`);
        });

        test('should query large datasets efficiently', async () => {
            const iterations = 10;
            const times = [];

            for (let i = 0; i < iterations; i++) {
                const start = Date.now();
                
                const response = await request(app)
                    .get(`/api/panels/${panelId}/breakers`)
                    .expect(200);

                const duration = Date.now() - start;
                times.push(duration);

                expect(response.body.length).toBeGreaterThan(0);
            }

            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const maxTime = Math.max(...times);

            // Performance benchmarks
            expect(avgTime).toBeLessThan(100); // 100ms average
            expect(maxTime).toBeLessThan(500); // 500ms max

            console.log(`✓ Query performance: avg=${avgTime.toFixed(2)}ms, max=${maxTime}ms`);
        });

        test('should handle concurrent requests efficiently', async () => {
            const concurrentRequests = 20;
            const start = Date.now();

            // Make many concurrent requests
            const promises = Array(concurrentRequests).fill().map((_, i) => 
                request(app)
                    .get(`/api/panels/${panelId}/breakers`)
                    .expect(200)
            );

            const responses = await Promise.all(promises);
            const duration = Date.now() - start;

            // All should succeed
            expect(responses).toHaveLength(concurrentRequests);
            responses.forEach(response => {
                expect(response.body.length).toBeGreaterThan(0);
            });

            // Performance benchmark
            expect(duration).toBeLessThan(5000); // 5 seconds for 20 concurrent requests
            console.log(`✓ Handled ${concurrentRequests} concurrent requests in ${duration}ms`);
        });
    });

    describe('Memory Usage Tests', () => {
        test('should not have significant memory leaks', async () => {
            const initialMemory = process.memoryUsage();
            
            // Perform many operations
            for (let i = 0; i < 100; i++) {
                await request(app)
                    .get('/api/panels')
                    .expect(200);
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage();
            const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

            // Memory growth should be reasonable (less than 10MB)
            expect(heapGrowth).toBeLessThan(10 * 1024 * 1024);
            console.log(`✓ Memory growth: ${(heapGrowth / 1024 / 1024).toFixed(2)}MB`);
        });
    });

    describe('Stress Tests', () => {
        test('should handle rapid successive requests', async () => {
            const requests = 50;
            const promises = [];

            // Make rapid successive requests
            for (let i = 0; i < requests; i++) {
                promises.push(
                    request(app)
                        .get('/api/panels')
                        .expect(200)
                );
            }

            const start = Date.now();
            const responses = await Promise.all(promises);
            const duration = Date.now() - start;

            expect(responses).toHaveLength(requests);
            expect(duration).toBeLessThan(3000); // 3 seconds max
            console.log(`✓ Handled ${requests} rapid requests in ${duration}ms`);
        });

        test('should handle complex data relationships efficiently', async () => {
            // Create complex nested data structure
            const numPanels = 5;
            const numBreakersPerPanel = 10;
            const numCircuitsPerBreaker = 3;

            const start = Date.now();

            // Create panels
            const panelPromises = Array(numPanels).fill().map((_, i) =>
                request(app)
                    .post('/api/panels')
                    .send({ name: `Complex Panel ${i}`, size: 20 })
            );
            const panels = await Promise.all(panelPromises);

            // Create breakers
            const breakerPromises = [];
            panels.forEach((panel, panelIndex) => {
                for (let i = 1; i <= numBreakersPerPanel; i++) {
                    breakerPromises.push(
                        request(app)
                            .post('/api/breakers')
                            .send({
                                panel_id: panel.body.id,
                                position: i,
                                label: `Complex Breaker ${panelIndex}-${i}`
                            })
                    );
                }
            });
            const breakers = await Promise.all(breakerPromises);

            // Create circuits
            const circuitPromises = [];
            breakers.forEach((breaker, breakerIndex) => {
                for (let i = 0; i < numCircuitsPerBreaker; i++) {
                    circuitPromises.push(
                        request(app)
                            .post('/api/circuits')
                            .send({
                                breaker_id: breaker.body.id,
                                type: ['outlet', 'lighting', 'appliance'][i % 3],
                                notes: `Complex Circuit ${breakerIndex}-${i}`
                            })
                    );
                }
            });
            await Promise.all(circuitPromises);

            const duration = Date.now() - start;

            // Query all data to test relationship performance
            const queryStart = Date.now();
            await request(app).get('/api/circuits').expect(200);
            const queryDuration = Date.now() - queryStart;

            const totalItems = numPanels + (numPanels * numBreakersPerPanel) + (numPanels * numBreakersPerPanel * numCircuitsPerBreaker);
            
            expect(duration).toBeLessThan(15000); // 15 seconds max for creation
            expect(queryDuration).toBeLessThan(1000); // 1 second max for complex query

            console.log(`✓ Created ${totalItems} related items in ${duration}ms, queried in ${queryDuration}ms`);
        });
    });

    describe('Error Handling Performance', () => {
        test('should handle validation errors efficiently', async () => {
            const invalidRequests = 100;
            const start = Date.now();

            // Make many invalid requests
            const promises = Array(invalidRequests).fill().map(() =>
                request(app)
                    .post('/api/panels')
                    .send({ invalid: 'data' })
                    .expect(400)
            );

            await Promise.all(promises);
            const duration = Date.now() - start;

            // Should handle errors quickly
            expect(duration).toBeLessThan(2000); // 2 seconds max
            console.log(`✓ Handled ${invalidRequests} validation errors in ${duration}ms`);
        });

        test('should handle non-existent resource requests efficiently', async () => {
            const notFoundRequests = 50;
            const start = Date.now();

            // Request non-existent resources
            const promises = Array(notFoundRequests).fill().map((_, i) =>
                request(app)
                    .get(`/api/panels/999${i}`)
                    .expect(404)
            );

            await Promise.all(promises);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(1000); // 1 second max
            console.log(`✓ Handled ${notFoundRequests} 404 errors in ${duration}ms`);
        });
    });

    describe('Database Optimization Tests', () => {
        test('should use database indexes effectively', async () => {
            // Test that position-based queries are fast
            const panel = await request(app)
                .post('/api/panels')
                .send({ name: 'Index Test Panel', size: 42 });
            
            const panelId = panel.body.id;

            // Add many breakers
            const breakerPromises = Array(42).fill().map((_, i) =>
                request(app)
                    .post('/api/breakers')
                    .send({
                        panel_id: panelId,
                        position: i + 1,
                        label: `Index Test Breaker ${i + 1}`
                    })
            );
            await Promise.all(breakerPromises);

            // Test position-based queries (should use index)
            const queryTimes = [];
            for (let i = 1; i <= 10; i++) {
                const start = Date.now();
                await request(app)
                    .get(`/api/panels/${panelId}/breakers/position/${i}`)
                    .expect(200);
                queryTimes.push(Date.now() - start);
            }

            const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
            
            // Position queries should be very fast due to indexing
            expect(avgQueryTime).toBeLessThan(50); // 50ms average
            console.log(`✓ Position-based queries averaged ${avgQueryTime.toFixed(2)}ms`);
        });
    });
});