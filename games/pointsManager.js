// games/pointsManager.js
const { Client } = require("pg");

const getClient = () => new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize the table (run once at startup)
async function initTable() {
  const client = getClient();
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS points (
      jid STRING PRIMARY KEY,
      points INT DEFAULT 0,
      games_played INT DEFAULT 0
    );
  `);
  await client.end();
}

// Add or update player points
async function addPoints(jid, pointsToAdd) {
  const client = getClient();
  await client.connect();
  await client.query(`
    INSERT INTO points (jid, points, games_played)
    VALUES ($1, $2, 1)
    ON CONFLICT (jid)
    DO UPDATE SET
      points = points.points + $2,
      games_played = points.games_played + 1;
  `, [jid, pointsToAdd]);
  const res = await client.query('SELECT points FROM points WHERE jid = $1', [jid]);
  await client.end();
  return res.rows[0]?.points || 0;
}

// Get player points
async function getPoints(jid) {
  const client = getClient();
  await client.connect();
  const res = await client.query('SELECT points FROM points WHERE jid = $1', [jid]);
  await client.end();
  return res.rows[0]?.points || 0;
}

// Get top players
async function getTopPlayers(limit = 10) {
  const client = getClient();
  await client.connect();
  const res = await client.query(
    'SELECT jid, points, games_played FROM points ORDER BY points DESC LIMIT $1',
    [limit]
  );
  await client.end();
  return res.rows;
}

module.exports = {
  initTable,
  addPoints,
  getPoints,
  getTopPlayers
};