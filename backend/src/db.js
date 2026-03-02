const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Check backend/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon needs SSL
});

module.exports = { pool };