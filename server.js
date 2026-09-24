const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error acquiring client (Make sure DATABASE_URL is set)', err.stack);
    } else {
        console.log('Connected to PostgreSQL database.');
        
        const initSql = `
            CREATE TABLE IF NOT EXISTS children (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                dob TEXT,
                sex TEXT,
                mobile TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS assessments (
                id SERIAL PRIMARY KEY,
                child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
                child_name TEXT NOT NULL,
                form_type TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS therapy_attendance (
                id SERIAL PRIMARY KEY,
                child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
                therapy_type TEXT NOT NULL,
                date TEXT NOT NULL,
                time_slot TEXT,
                therapist_name TEXT,
                sub_therapy TEXT,
                fee REAL,
                concession REAL,
                to_be_paid REAL,
                paid REAL,
                balance REAL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS therapists (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                therapy_type TEXT NOT NULL,
                fee REAL NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                date TEXT NOT NULL,
                child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
                time_slot TEXT NOT NULL,
                therapy_type TEXT NOT NULL,
                therapist_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        client.query(initSql, (err, result) => {
            release();
            if (err) {
                console.error('Error executing init script', err.stack);
            } else {
                console.log('Database tables initialized');
            }
        });
    }
});

// ─── Children API ─────────────────────────────────────────────────────────────

app.post('/api/children', async (req, res) => {
    const { name, dob, sex, mobile } = req.body;
    if (!name) return res.status(400).json({ error: 'Child name is required' });

    try {
        const result = await pool.query(
            `INSERT INTO children (name, dob, sex, mobile) VALUES ($1, $2, $3, $4) RETURNING id, name, dob, sex, mobile`,
            [name, dob || null, sex || null, mobile || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create child profile' });
    }
});

app.get('/api/children', async (req, res) => {
    const { search } = req.query;
    try {
        let sql = \`SELECT * FROM children\`;
        let params = [];
        if (search) {
            sql += \` WHERE name ILIKE $1\`;
            params.push(\`%\${search}%\`);
        }
        sql += \` ORDER BY created_at DESC\`;

        const childrenResult = await pool.query(sql, params);
        const children = childrenResult.rows;

        if (children.length === 0) return res.json([]);

        const childIds = children.map(c => c.id);
        
        // Construct IN clause dynamically
        const placeholders = childIds.map((_, i) => \`$\${i + 1}\`).join(',');
        
        const assessmentsResult = await pool.query(
            \`SELECT id, child_id, form_type, created_at FROM assessments WHERE child_id IN (\${placeholders}) ORDER BY created_at DESC\`,
            childIds
        );
        
        const assessments = assessmentsResult.rows;
        const aMap = {};
        assessments.forEach(a => {
            if (!aMap[a.child_id]) aMap[a.child_id] = [];
            aMap[a.child_id].push(a);
        });

        res.json(children.map(c => ({ ...c, assessments: aMap[c.id] || [] })));

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/children/:id', async (req, res) => {
    try {
        const childResult = await pool.query(\`SELECT * FROM children WHERE id = $1\`, [req.params.id]);
        if (childResult.rows.length === 0) return res.status(404).json({ error: 'Child not found' });
        
        const child = childResult.rows[0];
        const assessmentsResult = await pool.query(\`SELECT * FROM assessments WHERE child_id = $1 ORDER BY created_at DESC\`, [req.params.id]);
        
        const assessments = assessmentsResult.rows.map(a => {
            try { a.data = JSON.parse(a.data); } catch(e) {}
            return a;
        });
        
        res.json({ ...child, assessments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/children/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(\`DELETE FROM assessments WHERE child_id = $1\`, [req.params.id]);
        const result = await client.query(\`DELETE FROM children WHERE id = $1\`, [req.params.id]);
        
        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Child not found' });
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Child profile and assessments deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Transaction failed: ' + err.message });
    } finally {
        client.release();
    }
});

// ─── Assessments API ──────────────────────────────────────────────────────────

app.post('/api/assessments', async (req, res) => {
    const { child_id, child_name, form_type, data } = req.body;
    if (!child_name || !form_type || !data) return res.status(400).json({ error: 'Missing required fields' });

    try {
        const result = await pool.query(
            \`INSERT INTO assessments (child_id, child_name, form_type, data) VALUES ($1, $2, $3, $4) RETURNING id\`,
            [child_id || null, child_name, form_type, JSON.stringify(data)]
        );
        res.status(201).json({ message: 'Assessment saved successfully', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save assessment' });
    }
});

app.get('/api/assessments', async (req, res) => {
    const { search } = req.query;
    try {
        let sql = \`SELECT id, child_id, child_name, form_type, created_at FROM assessments\`;
        let params = [];
        if (search) {
            sql += \` WHERE child_name ILIKE $1\`;
            params.push(\`%\${search}%\`);
        }
        sql += \` ORDER BY created_at DESC\`;

        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve assessments' });
    }
});

app.get('/api/assessments/:id', async (req, res) => {
    try {
        const result = await pool.query(\`SELECT * FROM assessments WHERE id = $1\`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });
        
        const row = result.rows[0];
        try { row.data = JSON.parse(row.data); } catch (e) {}
        res.json(row);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve assessment' });
    }
});

app.put('/api/assessments/:id', async (req, res) => {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing data field' });

    try {
        const result = await pool.query(
            \`UPDATE assessments SET data = $1 WHERE id = $2\`,
            [JSON.stringify(data), req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Assessment not found' });
        res.json({ message: 'Assessment updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/assessments/:id', async (req, res) => {
    try {
        const result = await pool.query(\`DELETE FROM assessments WHERE id = $1\`, [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Assessment not found' });
        res.json({ message: 'Assessment deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Therapy Attendance API ─────────────────────────────────────────────────────

app.post('/api/attendance', async (req, res) => {
    const { child_id, therapy_type, date, time_slot, therapist_name, sub_therapy, fee, concession, to_be_paid, paid, balance, notes } = req.body;
    if (!child_id || !therapy_type || !date) return res.status(400).json({ error: 'Missing required fields' });

    try {
        const result = await pool.query(
            \`INSERT INTO therapy_attendance (
                child_id, therapy_type, date, time_slot, therapist_name, sub_therapy, fee, concession, to_be_paid, paid, balance, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id\`,
            [
                child_id, therapy_type, date, time_slot || null, therapist_name || null, sub_therapy || null,
                fee || 0, concession || 0, to_be_paid || 0, paid || 0, balance || 0, notes || null
            ]
        );
        res.status(201).json({ message: 'Attendance logged', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/attendance', async (req, res) => {
    const { start_date, end_date, child_id } = req.query;
    try {
        let sql = \`
            SELECT t.*, c.name as child_name 
            FROM therapy_attendance t 
            JOIN children c ON t.child_id = c.id 
            WHERE 1=1
        \`;
        const params = [];
        let paramIndex = 1;

        if (start_date) {
            sql += \` AND t.date >= $\${paramIndex++}\`;
            params.push(start_date);
        }
        if (end_date) {
            sql += \` AND t.date <= $\${paramIndex++}\`;
            params.push(end_date);
        }
        if (child_id) {
            sql += \` AND t.child_id = $\${paramIndex++}\`;
            params.push(child_id);
        }

        sql += \` ORDER BY t.date DESC\`;
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/reports/attendance/:id', async (req, res) => {
    const { fee, concession, paid, balance } = req.body;
    try {
        const result = await pool.query(
            \`UPDATE therapy_attendance SET fee = $1, concession = $2, paid = $3, balance = $4 WHERE id = $5\`,
            [fee, concession, paid, balance, req.params.id]
        );
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reports/attendance/:id', async (req, res) => {
    try {
        const result = await pool.query(\`DELETE FROM therapy_attendance WHERE id = $1\`, [req.params.id]);
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Therapists API ─────────────────────────────────────────────────────────────

app.get('/api/therapists', async (req, res) => {
    try {
        const result = await pool.query(\`SELECT * FROM therapists ORDER BY name ASC\`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/therapists', async (req, res) => {
    const { name, therapy_type, fee } = req.body;
    if (!name || !therapy_type) return res.status(400).json({ error: 'Name and therapy type are required' });
    
    try {
        const result = await pool.query(
            \`INSERT INTO therapists (name, therapy_type, fee) VALUES ($1, $2, $3) RETURNING id, name, therapy_type, fee\`,
            [name, therapy_type, fee || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/therapists/:id', async (req, res) => {
    try {
        await pool.query(\`DELETE FROM therapists WHERE id = $1\`, [req.params.id]);
        res.json({ message: 'Therapist deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Schedules API ─────────────────────────────────────────────────────────────

app.get('/api/schedules', async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    
    try {
        const result = await pool.query(\`
            SELECT s.*, c.name as child_name 
            FROM schedules s 
            JOIN children c ON s.child_id = c.id 
            WHERE s.date = $1
        \`, [date]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/schedules', async (req, res) => {
    const { date, child_id, time_slot, therapy_type, therapist_name } = req.body;
    if (!date || !child_id || !time_slot || !therapy_type) return res.status(400).json({ error: 'Missing required fields' });
    
    try {
        const checkResult = await pool.query(
            \`SELECT id FROM schedules WHERE date = $1 AND child_id = $2 AND time_slot = $3\`,
            [date, child_id, time_slot]
        );
        
        if (checkResult.rows.length > 0) {
            const rowId = checkResult.rows[0].id;
            await pool.query(
                \`UPDATE schedules SET therapy_type = $1, therapist_name = $2 WHERE id = $3\`,
                [therapy_type, therapist_name, rowId]
            );
            res.json({ id: rowId, date, child_id, time_slot, therapy_type, therapist_name });
        } else {
            const insertResult = await pool.query(
                \`INSERT INTO schedules (date, child_id, time_slot, therapy_type, therapist_name) VALUES ($1, $2, $3, $4, $5) RETURNING id\`,
                [date, child_id, time_slot, therapy_type, therapist_name]
            );
            res.status(201).json({ id: insertResult.rows[0].id, date, child_id, time_slot, therapy_type, therapist_name });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    try {
        await pool.query(\`DELETE FROM schedules WHERE id = $1\`, [req.params.id]);
        res.json({ message: 'Schedule deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Export app for Vercel Serverless
module.exports = app;

// Optionally start server if run directly (useful for local testing)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(\`Server is running on http://localhost:\${PORT}\`);
    });
}
