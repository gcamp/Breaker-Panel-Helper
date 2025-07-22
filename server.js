const express = require('express');
const cors = require('cors');
const path = require('path');
const DatabaseService = require('./services/database-service');
const ErrorHandler = require('./services/error-handler');
const { router, setDatabaseService } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // More secure than bodyParser
app.use(express.static('public'));

// Register routes (database service will be set later)
app.use('/api', router);

// Database service instance
const databaseService = new DatabaseService();

// Static route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use(ErrorHandler.globalErrorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Database initialization and server startup
const connectDB = async () => {
    const DB_PATH = process.env.DB_PATH || 'breaker_panel.db';
    
    try {
        await databaseService.initialize(DB_PATH);
        setDatabaseService(databaseService);
        console.log('Database service initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database service:', error.message);
        throw error;
    }
};

// Graceful shutdown
const gracefulShutdown = async () => {
    console.log('\nReceived shutdown signal, closing database...');
    try {
        await databaseService.close();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(1);
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