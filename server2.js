/**
 * ╔══════════════════════════════════════════════╗
 *   Solitaire Leaderboard — server.js
 *   Stack : Node.js + Express + pg (PostgreSQL)
 *   Host  : Render.com (Web Service)
 * ╚══════════════════════════════════════════════╝
 *
 *  HOW TO DEPLOY ON RENDER (step-by-step at the bottom of this file)
 */

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');

// ── App ───────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Allow requests from any origin so your HTML file can call this API
// from anywhere (GitHub Pages, local file, another host, etc.)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
}));

// ── Database ──────────────────────────────────
// Render automatically sets the DATABASE_URL environment variable
// when you link a PostgreSQL database to your web service.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required on Render's free PostgreSQL
});

// Create the scores table if it doesn't exist yet.
// This runs once at startup — safe to call every time.
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id        SERIAL PRIMARY KEY,
      name      VARCHAR(30)  NOT NULL,
      time      INTEGER      NOT NULL,
      date      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(time ASC);
  `);
  console.log('✅  Database ready');
}

// ── Validation constants ──────────────────────
const MIN_TIME =    30;   // seconds — anything faster is a cheat
const MAX_TIME = 86400;   // 24 hours
const MAX_NAME =    30;   // characters

// ── Simple in-memory rate limiter (per IP) ────
// Resets every 60 seconds, max 5 score submissions per window
const rateLimitStore = new Map();
function isRateLimited(ip) {
  const now  = Date.now();
  let   data = rateLimitStore.get(ip);
  if(!data || now > data.reset) {
    data = { count: 0, reset: now + 60_000 };
  }
  data.count++;
  rateLimitStore.set(ip, data);
  return data.count > 5;
}

// ════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════

// ── Health check ─────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── GET /api/scores ───────────────────────────
// Returns the top 100 scores sorted fastest → slowest
app.get('/api/scores', async (_, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, time, date
       FROM scores
       ORDER BY time ASC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/scores:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST /api/scores ──────────────────────────
// Body: { name: string, time: number (seconds) }
app.post('/api/scores', async (req, res) => {
  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  let { name, time } = req.body;

  // Validate name
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  name = name.trim().slice(0, MAX_NAME);

  // Validate time
  if (typeof time !== 'number' || !Number.isInteger(time)) {
    return res.status(400).json({ error: 'time must be an integer (seconds)' });
  }
  if (time < MIN_TIME) {
    return res.status(400).json({ error: `Time too fast — minimum is ${MIN_TIME}s` });
  }
  if (time > MAX_TIME) {
    return res.status(400).json({ error: 'Time value is unrealistically large' });
  }

  try {
    await pool.query(
      `INSERT INTO scores (name, time) VALUES ($1, $2)`,
      [name, time]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST /api/scores:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── DELETE /api/scores/:id (admin only) ───────
// Pass the header:  x-admin-key: <your ADMIN_KEY env var>
app.delete('/api/scores/:id', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query('DELETE FROM scores WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Start ─────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🃏  Solitaire leaderboard listening on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });


/*
═══════════════════════════════════════════════════════
  HOW TO DEPLOY THIS ON RENDER — STEP BY STEP
═══════════════════════════════════════════════════════

STEP 1 — Create a GitHub repository
  1. Go to https://github.com and sign in (or create a free account).
  2. Click "New repository", name it "solitaire-backend", set it to Public, click Create.
  3. Inside that repo create two files:
       • server.js  ← this file
       • package.json ← see contents below

  package.json contents:
  ──────────────────────
  {
    "name": "solitaire-backend",
    "version": "1.0.0",
    "main": "server.js",
    "scripts": { "start": "node server.js" },
    "dependencies": {
      "cors": "^2.8.5",
      "express": "^4.18.2",
      "pg": "^8.11.3"
    }
  }

STEP 2 — Create a PostgreSQL database on Render
  1. Go to https://render.com and sign in (free account works).
  2. Click "New +" → "PostgreSQL".
  3. Give it a name like "solitaire-db".
  4. Choose the Free plan → click "Create Database".
  5. Wait ~1 minute for it to become available.
  6. Copy the "Internal Database URL" shown on the database page — you'll need it in Step 3.

STEP 3 — Create a Web Service on Render
  1. Click "New +" → "Web Service".
  2. Connect your GitHub account and select the "solitaire-backend" repo.
  3. Settings:
       • Environment : Node
       • Build Command: npm install
       • Start Command: node server.js
       • Plan: Free
  4. Scroll to "Environment Variables" and add:
       • DATABASE_URL  = <paste the Internal Database URL from Step 2>
       • ADMIN_KEY     = <make up any secret password for admin deletes>
  5. Click "Create Web Service".
  6. Render will build and deploy — takes ~2 minutes.
  7. Your API URL will be something like:
       https://solitaire-backend.onrender.com

STEP 4 — Update your solitaire.html
  Find this line near the top of the <script> section:
    const API = 'https://YOUR_BACKEND_URL/api';
  Replace it with your actual Render URL, e.g.:
    const API = 'https://solitaire-backend.onrender.com/api';

STEP 5 — Test it
  Open your browser and visit:
    https://solitaire-backend.onrender.com/api/scores
  You should see an empty array: []
  That means everything is working!

NOTE: Render's free tier "spins down" the server after 15 minutes of
inactivity. The first request after a sleep takes ~30 seconds to wake up.
This is normal on the free plan. Upgrade to a paid plan ($7/mo) if you
want it always-on.

═══════════════════════════════════════════════════════
*/