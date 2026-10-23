require('dotenv').config();
const { Pool } = require('pg');

let dbUrl = process.env.DATABASE_URL;
if (dbUrl.includes('pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
}

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        console.log('Starting migration: ADM -> EIC for all existing children...');
        const before = await pool.query("SELECT id, name, admission_no FROM children WHERE admission_no ILIKE 'ADM%' ORDER BY id ASC");
        console.log(`Found ${before.rows.length} children with ADM admission numbers.`);

        const result = await pool.query(`
            UPDATE children 
            SET admission_no = REGEXP_REPLACE(admission_no, '^ADM([-_]?)', 'EIC\\1', 'i')
            WHERE admission_no ILIKE 'ADM%'
        `);
        console.log(`Successfully updated ${result.rowCount} children.`);

        const after = await pool.query("SELECT id, name, admission_no FROM children ORDER BY id ASC");
        console.log('Current children in database:');
        console.table(after.rows);

        await pool.end();
        console.log('Migration completed.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
