const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'mysql',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'chores_user',
  password: process.env.DB_PASSWORD || 'ChoresPass123!',
  database: process.env.DB_NAME || 'family_chores',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  charset: 'utf8mb4',
  timezone: '+00:00'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test connection on startup
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

// Initialize connection test
testConnection();

// Enhanced query function with error handling and logging
async function query(sql, params = []) {
  const start = Date.now();
  
  try {
    const [results] = await pool.execute(sql, params);
    const duration = Date.now() - start;
    
    // Log slow queries (> 1 second)
    if (duration > 1000) {
      console.warn(`⚠️ Slow query detected (${duration}ms):`, sql.substring(0, 100));
    }
    
    return results;
  } catch (error) {
    console.error('Database query error:', {
      sql: sql.substring(0, 100),
      params: params,
      error: error.message
    });
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Get connection for complex operations
async function getConnection() {
  return await pool.getConnection();
}

// Close pool gracefully
async function closePool() {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
}

// Handle process termination
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
  query,
  transaction,
  getConnection,
  closePool,
  pool
};
