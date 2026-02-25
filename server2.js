const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'solitaire.html'));
});

/* ---------- LEADERBOARD ROUTES ---------- */

// Save score
app.post('/api/leaderboard', async (req, res) => {
  const { name, time } = req.body;

  if (!name || !time) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  try {
    await pool.query(
      'INSERT INTO leaderboard (name, time) VALUES ($1, $2)',
      [name, time]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get top 10 fastest times
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, time FROM leaderboard ORDER BY time ASC LIMIT 10'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---------- SERVER ---------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});