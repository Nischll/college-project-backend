const { Pool } = require('pg');

// Configure the connection
const pool = new Pool({
  user: 'postgres',         // Your PostgreSQL username
  host: 'localhost',        // Host (adjust if not local)
  database: 'inventory',    // Your database name
  password: 'postgres', // Your PostgreSQL password
  port: 5432,               // Default PostgreSQL port
});

// Export the pool for use in other parts of the app
module.exports = pool;

// const pool = require('./dbConfig');

(async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL database!');
    client.release(); // Always release the client after use
  } catch (error) {
    console.error('Error connecting to PostgreSQL:', error.message);
  }
})();
