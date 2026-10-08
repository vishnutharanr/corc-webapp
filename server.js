const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'corc-super-secret-key-2026-provision';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
    console.error('DATABASE_URL environment variable is not set.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_URL,
    ssl: (DB_URL.includes('localhost') || DB_URL.includes('127.0.0.1')) ? false : { rejectUnauthorized: false }
});

const INIT_SQL = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        full_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        admission_no TEXT,
        dob TEXT,
        sex TEXT,
        mobile TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE children ADD COLUMN IF NOT EXISTS admission_no TEXT;

    CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY,
        child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
        child_name TEXT NOT NULL,
        form_type TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='assessments' AND column_name='data' AND data_type='text'
        ) THEN
            BEGIN
                ALTER TABLE assessments ALTER COLUMN data TYPE JSONB USING data::jsonb;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END $$;

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
        status TEXT DEFAULT 'Present',
        payment_mode TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE therapy_attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Present';
    ALTER TABLE therapy_attendance ADD COLUMN IF NOT EXISTS payment_mode TEXT;

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

    CREATE INDEX IF NOT EXISTS idx_assessments_child_id ON assessments(child_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_form_type ON assessments(form_type);
    CREATE INDEX IF NOT EXISTS idx_assessments_data_gin ON assessments USING gin (data);
    CREATE INDEX IF NOT EXISTS idx_therapy_attendance_child_id ON therapy_attendance(child_id);
    CREATE INDEX IF NOT EXISTS idx_therapy_attendance_date ON therapy_attendance(date);
    CREATE INDEX IF NOT EXISTS idx_children_admission_no ON children(admission_no);
    CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
    CREATE INDEX IF NOT EXISTS idx_schedules_child_id ON schedules(child_id);

    UPDATE schedules SET time_slot = '4.00 - 4.30' WHERE time_slot = '4.00 - 5.00';
    UPDATE therapy_attendance SET time_slot = '4.00 - 4.30' WHERE time_slot = '4.00 - 5.00';
`;

async function seedDefaultUsers() {
    try {
        const existing = await pool.query(`SELECT count(*) FROM users`);
        if (parseInt(existing.rows[0].count, 10) === 0) {
            const adminHash = await bcrypt.hash('admin', 10);
            const staffHash = await bcrypt.hash('staff', 10);
            const staff8Hash = await bcrypt.hash('staff8', 10);

            await pool.query(`
                INSERT INTO users (username, password_hash, role, full_name) VALUES
                ('admin', $1, 'admin', 'Administrator'),
                ('staff', $2, 'staff', 'Staff (Under 8)'),
                ('staff8', $3, 'staff8', 'Staff (8 & Above)')
            `, [adminHash, staffHash, staff8Hash]);
            console.log('Default users seeded successfully.');
        }
    } catch (e) {
        console.error('Error seeding default users:', e.message);
    }
}

pool.query(INIT_SQL)
    .then(async () => {
        console.log('Database tables & indexes initialized');
        await seedDefaultUsers();
    })
    .catch(err => console.error('Error executing init script:', err.stack));

// ─── Authentication Middleware ──────────────────────────────────────────────
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired session token' });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator access required' });
    }
    next();
}

// ─── DB Init API ─────────────────────────────────────────────────────────────
app.get('/api/init-db', async (req, res) => {
    try {
        await pool.query(INIT_SQL);
        await seedDefaultUsers();
        res.json({ message: 'Database tables and indexes initialized successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Auth APIs ─────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const u = username.trim().toLowerCase();
        const userRes = await pool.query(`SELECT * FROM users WHERE LOWER(username) = $1`, [u]);
        
        let user = userRes.rows[0];
        let passwordMatches = false;

        if (user) {
            passwordMatches = await bcrypt.compare(password, user.password_hash);
        } else {
            // Fallback for bootstrap
            if ((u === 'admin' && password === 'admin') ||
                (u === 'staff' && password === 'staff') ||
                (u === 'staff8' && password === 'staff8')) {
                const hash = await bcrypt.hash(password, 10);
                const role = u;
                const name = u === 'admin' ? 'Administrator' : (u === 'staff' ? 'Staff (Under 8)' : 'Staff (8 & Above)');
                const inserted = await pool.query(
                    `INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING *`,
                    [u, hash, role, name]
                );
                user = inserted.rows[0];
                passwordMatches = true;
            }
        }

        if (!user || !passwordMatches) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            role: user.role,
            username: user.username,
            full_name: user.full_name,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name || user.username,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login service failed: ' + err.message });
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    try {
        const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = userRes.rows[0];
        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, req.user.id]);
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── User Management (Admin Only) ──────────────────────────────────────────
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, role, full_name, created_at FROM users ORDER BY id ASC`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role, full_name, fullName } = req.body;
    const displayName = full_name || fullName;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    try {
        const u = username.trim().toLowerCase();
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id, username, role, full_name, created_at`,
            [u, hash, role, displayName || u]
        );
        const createdUser = result.rows[0];
        res.status(201).json({
            success: true,
            user: {
                id: createdUser.id,
                username: createdUser.username,
                fullName: createdUser.full_name,
                role: createdUser.role,
                created_at: createdUser.created_at
            },
            ...createdUser
        });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Username already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    if (parseInt(req.params.id, 10) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    try {
        const result = await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Children API ─────────────────────────────────────────────────────────────

app.post('/api/children', async (req, res) => {
    const { name, admission_no, dob, sex, mobile } = req.body;
    const trimmedName = name ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Child name is required' });

    try {
        const result = await pool.query(
            `INSERT INTO children (name, admission_no, dob, sex, mobile) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, admission_no, dob, sex, mobile`,
            [trimmedName, admission_no ? admission_no.trim() : null, dob || null, sex || null, mobile || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create child profile: ' + err.message });
    }
});

app.put('/api/children/:id', async (req, res) => {
    const { name, admission_no, dob, sex, mobile } = req.body;
    const trimmedName = name ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Child name is required' });

    try {
        const result = await pool.query(
            `UPDATE children SET 
                name = $1, 
                admission_no = $2, 
                dob = $3, 
                sex = $4, 
                mobile = $5 
            WHERE id = $6 RETURNING id, name, admission_no, dob, sex, mobile`,
            [trimmedName, admission_no ? admission_no.trim() : null, dob || null, sex || null, mobile || null, req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Child not found' });

        // Synchronize assessments child_name
        await pool.query(`UPDATE assessments SET child_name = $1 WHERE child_id = $2`, [trimmedName, req.params.id]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update child profile: ' + err.message });
    }
});

app.get('/api/children', async (req, res) => {
    const { search } = req.query;
    try {
        let sql = `SELECT * FROM children`;
        let params = [];
        if (search) {
            sql += ` WHERE (name ILIKE $1 OR admission_no ILIKE $1 OR mobile ILIKE $1)`;
            params.push(`%${search}%`);
        }
        sql += ` ORDER BY created_at DESC`;

        const childrenResult = await pool.query(sql, params);
        const children = childrenResult.rows;

        if (children.length === 0) return res.json([]);

        const childIds = children.map(c => c.id);

        const assessmentsResult = await pool.query(
            `SELECT id, child_id, form_type, created_at, data FROM assessments WHERE child_id = ANY($1) ORDER BY created_at DESC`,
            [childIds]
        );

        const assessments = assessmentsResult.rows;
        const aMap = {};
        assessments.forEach(a => {
            try { a.data = typeof a.data === 'string' ? JSON.parse(a.data) : a.data; } catch (e) { }
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
        const childResult = await pool.query(`SELECT * FROM children WHERE id = $1`, [req.params.id]);
        if (childResult.rows.length === 0) return res.status(404).json({ error: 'Child not found' });

        const child = childResult.rows[0];
        const assessmentsResult = await pool.query(`SELECT * FROM assessments WHERE child_id = $1 ORDER BY created_at DESC`, [req.params.id]);

        const assessments = assessmentsResult.rows.map(a => {
            try { a.data = typeof a.data === 'string' ? JSON.parse(a.data) : a.data; } catch (e) { }
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
        await client.query(`DELETE FROM assessments WHERE child_id = $1`, [req.params.id]);
        await client.query(`DELETE FROM therapy_attendance WHERE child_id = $1`, [req.params.id]);
        await client.query(`DELETE FROM schedules WHERE child_id = $1`, [req.params.id]);
        const result = await client.query(`DELETE FROM children WHERE id = $1`, [req.params.id]);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Child not found' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Child profile and all related records deleted successfully' });
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
        const stringifiedData = typeof data === 'string' ? data : JSON.stringify(data);
        const result = await pool.query(
            `INSERT INTO assessments (child_id, child_name, form_type, data) VALUES ($1, $2, $3, $4) RETURNING id`,
            [child_id || null, child_name, form_type, stringifiedData]
        );
        res.status(201).json({ message: 'Assessment saved successfully', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save assessment' });
    }
});

app.get('/api/assessments', async (req, res) => {
    const { search, child_id } = req.query;
    try {
        let sql = `SELECT id, child_id, child_name, form_type, created_at, data FROM assessments`;
        let params = [];
        let conditions = [];
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`child_name ILIKE $${params.length}`);
        }
        if (child_id) {
            params.push(child_id);
            conditions.push(`child_id = $${params.length}`);
        }
        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }
        sql += ` ORDER BY created_at DESC`;

        const result = await pool.query(sql, params);
        res.json(result.rows.map(r => {
            try { r.data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch (e) { }
            return r;
        }));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve assessments' });
    }
});

app.get('/api/assessments/:id', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM assessments WHERE id = $1`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });

        const row = result.rows[0];
        try { row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data; } catch (e) { }
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
        const stringifiedData = typeof data === 'string' ? data : JSON.stringify(data);
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

        const currentResult = await pool.query(`SELECT child_id, form_type FROM assessments WHERE id = $1`, [req.params.id]);
        if (currentResult.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });

        const { child_id, form_type } = currentResult.rows[0];

        await pool.query(
            `UPDATE assessments SET data = $1 WHERE id = $2`,
            [stringifiedData, req.params.id]
        );

        // Sync basic details to children profile if Rapid Assessment
        if (child_id && form_type === 'Rapid Assessment' && parsedData) {
            const childName = parsedData.child_name || parsedData.name;
            const admissionNo = parsedData.admission_no !== undefined ? parsedData.admission_no : null;
            const dob = parsedData.dob !== undefined ? parsedData.dob : null;
            const sex = parsedData.sex !== undefined ? parsedData.sex : null;
            const mobile = parsedData.mobile !== undefined ? parsedData.mobile : null;

            await pool.query(
                `UPDATE children SET 
                    name = COALESCE($1, name), 
                    admission_no = COALESCE($2, admission_no),
                    dob = COALESCE($3, dob), 
                    sex = COALESCE($4, sex), 
                    mobile = COALESCE($5, mobile) 
                WHERE id = $6`,
                [childName || null, admissionNo ? admissionNo.trim() : null, dob || null, sex || null, mobile || null, child_id]
            );

            if (childName) {
                await pool.query(`UPDATE assessments SET child_name = $1 WHERE id = $2`, [childName, req.params.id]);
            }
        }

        res.json({ message: 'Assessment updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/assessments/:id', async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM assessments WHERE id = $1`, [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Assessment not found' });
        res.json({ message: 'Assessment deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Therapy Attendance API ─────────────────────────────────────────────────────

app.post('/api/attendance', async (req, res) => {
    const { child_id, therapy_type, date, time_slot, therapist_name, sub_therapy, fee, concession, to_be_paid, paid, balance, notes, status, payment_mode } = req.body;
    if (!child_id || !therapy_type || !date) return res.status(400).json({ error: 'Missing required fields' });

    try {
        const numFee = parseFloat(fee) || 0;
        const numConcession = parseFloat(concession) || 0;
        const numToBePaid = to_be_paid !== undefined && to_be_paid !== '' ? (parseFloat(to_be_paid) || 0) : Math.max(0, numFee - numConcession);
        const numPaid = parseFloat(paid) || 0;
        const numBalance = balance !== undefined && balance !== '' ? (parseFloat(balance) || 0) : (numToBePaid - numPaid);

        const result = await pool.query(
            `INSERT INTO therapy_attendance (
                child_id, therapy_type, date, time_slot, therapist_name, sub_therapy, fee, concession, to_be_paid, paid, balance, notes, status, payment_mode
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
            [
                child_id, therapy_type, date, time_slot || null, therapist_name || null, sub_therapy || null,
                numFee, numConcession, numToBePaid, numPaid, numBalance, notes || null, status || 'Present', payment_mode || null
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
        let sql = `
            SELECT t.*, c.name as child_name, c.dob as child_dob, c.admission_no as child_admission_no,
                   (SELECT data FROM assessments WHERE child_id = c.id AND form_type = 'Rapid Assessment' ORDER BY created_at DESC LIMIT 1) as rapid_data
            FROM therapy_attendance t 
            JOIN children c ON t.child_id = c.id 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (start_date) {
            sql += ` AND t.date >= $${paramIndex++}`;
            params.push(start_date);
        }
        if (end_date) {
            sql += ` AND t.date <= $${paramIndex++}`;
            params.push(end_date);
        }
        if (child_id) {
            sql += ` AND t.child_id = $${paramIndex++}`;
            params.push(child_id);
        }

        sql += ` ORDER BY t.date DESC`;
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/reports/attendance/:id', async (req, res) => {
    const { fee, concession, paid, balance, to_be_paid } = req.body;
    try {
        const numFee = parseFloat(fee) || 0;
        const numConcession = parseFloat(concession) || 0;
        const numToBePaid = to_be_paid !== undefined && to_be_paid !== '' ? (parseFloat(to_be_paid) || 0) : Math.max(0, numFee - numConcession);
        const numPaid = parseFloat(paid) || 0;
        const numBalance = balance !== undefined && balance !== '' ? (parseFloat(balance) || 0) : (numToBePaid - numPaid);

        const result = await pool.query(
            `UPDATE therapy_attendance SET fee = $1, concession = $2, to_be_paid = $3, paid = $4, balance = $5 WHERE id = $6`,
            [numFee, numConcession, numToBePaid, numPaid, numBalance, req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Record not found' });
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reports/attendance/:id', async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM therapy_attendance WHERE id = $1`, [req.params.id]);
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Therapists API ─────────────────────────────────────────────────────────────

app.get('/api/therapists', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM therapists ORDER BY name ASC`);
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
            `INSERT INTO therapists (name, therapy_type, fee) VALUES ($1, $2, $3) RETURNING id, name, therapy_type, fee`,
            [name.trim(), therapy_type, parseFloat(fee) || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/therapists/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM therapists WHERE id = $1`, [req.params.id]);
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
        const result = await pool.query(`
            SELECT s.*, c.name as child_name, c.dob as child_dob, c.admission_no as child_admission_no 
            FROM schedules s 
            JOIN children c ON s.child_id = c.id 
            WHERE s.date = $1
        `, [date]);
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
        const cid = parseInt(child_id, 10);
        const checkResult = await pool.query(
            `SELECT id FROM schedules WHERE date = $1 AND child_id = $2 AND time_slot = $3`,
            [date, cid, time_slot]
        );

        if (checkResult.rows.length > 0) {
            const rowId = checkResult.rows[0].id;
            await pool.query(
                `UPDATE schedules SET therapy_type = $1, therapist_name = $2 WHERE id = $3`,
                [therapy_type, therapist_name || null, rowId]
            );
            res.json({ id: rowId, date, child_id: cid, time_slot, therapy_type, therapist_name });
        } else {
            const insertResult = await pool.query(
                `INSERT INTO schedules (date, child_id, time_slot, therapy_type, therapist_name) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [date, cid, time_slot, therapy_type, therapist_name || null]
            );
            res.status(201).json({ id: insertResult.rows[0].id, date, child_id: cid, time_slot, therapy_type, therapist_name });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM schedules WHERE id = $1`, [req.params.id]);
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
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}
