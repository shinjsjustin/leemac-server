const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

const MIGRATION_FILE = path.join(__dirname, 'migrations', '001_add_s3_key.sql');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
});

async function runMigration() {
    let connection;
    try {
        const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

        connection = await pool.promise().getConnection();
        console.log(`[migration] Connected to database "${process.env.DB_NAME}"`);

        console.log(`[migration] Executing ${path.basename(MIGRATION_FILE)} ...`);
        await connection.query(sql);

        console.log('[migration] Migration completed successfully.');
    } catch (err) {
        console.error('[migration] Migration failed:', err.message);
        process.exit(1);
    } finally {
        if (connection) connection.release();
        pool.end();
    }
}

runMigration();
