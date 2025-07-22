/**
 * CRUD Helper Functions - Consolidates duplicate route patterns
 */
const ErrorHandler = require('./services/error-handler');

class CrudHelpers {
    /**
     * Set the database service for CRUD helpers
     * @param {Object} dbService - Database service instance
     */
    static setDatabaseService(dbService) {
        this.databaseService = dbService;
    }

    /**
     * Generic delete handler for simple delete operations
     * @param {string} tableName - Database table name
     * @param {string} entityName - Entity name for error messages
     * @returns {Function} Express route handler
     */
    static createDeleteHandler(tableName, entityName) {
        return ErrorHandler.asyncHandler(async (req, res) => {
            const result = await CrudHelpers.databaseService.run(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);
            
            if (result.changes === 0) {
                const errorInfo = ErrorHandler.handleNotFoundError(entityName);
                return ErrorHandler.sendError(res, errorInfo);
            }
            
            res.json({ message: `${entityName} deleted successfully` });
        });
    }

    /**
     * Generic get by ID handler
     * @param {string} tableName - Database table name
     * @param {string} entityName - Entity name for error messages
     * @param {string} selectClause - Custom SELECT clause (optional)
     * @returns {Function} Express route handler
     */
    static createGetByIdHandler(tableName, entityName, selectClause = null) {
        return ErrorHandler.asyncHandler(async (req, res) => {
            const query = selectClause || `SELECT * FROM ${tableName} WHERE id = ?`;
            const entity = await CrudHelpers.databaseService.get(query, [req.params.id]);
            
            if (!entity) {
                const errorInfo = ErrorHandler.handleNotFoundError(entityName);
                return ErrorHandler.sendError(res, errorInfo);
            }
            
            res.json(entity);
        });
    }

    /**
     * Generic create handler for simple entities
     * @param {string} tableName - Database table name
     * @param {Array} fields - Field names to extract from request body
     * @param {Function} transformer - Optional function to transform field values
     * @returns {Function} Express route handler
     */
    static createCreateHandler(tableName, fields, transformer = null) {
        return ErrorHandler.asyncHandler(async (req, res) => {
            // Extract fields from request body
            const data = {};
            fields.forEach(field => {
                data[field] = req.body[field];
            });

            // Apply transformation if provided
            const finalData = transformer ? transformer(data) : data;

            try {
                const placeholders = fields.map(() => '?').join(', ');
                const fieldNames = fields.join(', ');
                const values = fields.map(field => finalData[field]);
                
                const result = await CrudHelpers.databaseService.run(
                    `INSERT INTO ${tableName} (${fieldNames}) VALUES (${placeholders})`,
                    values
                );
                
                res.status(201).json({ id: result.id, ...finalData });
            } catch (error) {
                const errorInfo = ErrorHandler.handleDatabaseError(error);
                ErrorHandler.sendError(res, errorInfo);
            }
        });
    }

    /**
     * Generic update handler for simple entities
     * @param {string} tableName - Database table name
     * @param {string} entityName - Entity name for error messages
     * @param {Array} fields - Field names to extract from request body
     * @param {Function} transformer - Optional function to transform field values
     * @returns {Function} Express route handler
     */
    static createUpdateHandler(tableName, entityName, fields, transformer = null) {
        return ErrorHandler.asyncHandler(async (req, res) => {
            // Extract fields from request body
            const data = {};
            fields.forEach(field => {
                data[field] = req.body[field];
            });

            // Apply transformation if provided
            const finalData = transformer ? transformer(data) : data;

            try {
                const setClause = fields.map(field => `${field} = ?`).join(', ');
                const values = fields.map(field => finalData[field]);
                values.push(req.params.id); // Add ID for WHERE clause
                
                const result = await CrudHelpers.databaseService.run(
                    `UPDATE ${tableName} SET ${setClause} WHERE id = ?`,
                    values
                );
                
                if (result.changes === 0) {
                    const errorInfo = ErrorHandler.handleNotFoundError(entityName);
                    return ErrorHandler.sendError(res, errorInfo);
                }
                
                res.json({ id: req.params.id, ...finalData });
            } catch (error) {
                const errorInfo = ErrorHandler.handleDatabaseError(error);
                ErrorHandler.sendError(res, errorInfo);
            }
        });
    }

    /**
     * Middleware to inject database service into request object
     * @param {Object} databaseService - Database service instance
     * @returns {Function} Express middleware
     */
    static injectDatabaseService(databaseService) {
        return (req, res, next) => {
            req.databaseService = databaseService;
            next();
        };
    }

    /**
     * Standard data transformer for trimming text fields
     * @param {Array} textFields - Fields that should be trimmed
     * @returns {Function} Transformer function
     */
    static createTextTrimmer(textFields) {
        return (data) => {
            const transformed = { ...data };
            textFields.forEach(field => {
                if (transformed[field] && typeof transformed[field] === 'string') {
                    transformed[field] = transformed[field].trim();
                }
            });
            return transformed;
        };
    }

    /**
     * Handle database validation errors consistently
     * @param {Object} res - Express response object
     * @param {string} message - Validation error message
     */
    static handleValidationError(res, message) {
        const errorInfo = ErrorHandler.handleValidationError(message);
        ErrorHandler.sendError(res, errorInfo);
    }

    /**
     * Validate numeric parameter
     * @param {string} paramName - Parameter name
     * @returns {Function} Express middleware
     */
    static validateNumericParam(paramName = 'id') {
        return (req, res, next) => {
            const value = parseInt(req.params[paramName]);
            if (isNaN(value) || value <= 0) {
                return CrudHelpers.handleValidationError(res, `Invalid ${paramName} parameter`);
            }
            req.params[paramName] = value;
            next();
        };
    }
}

module.exports = CrudHelpers;