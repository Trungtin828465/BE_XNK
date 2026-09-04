const pool = require('../config/database');

async function createActivityLog({ userId, action, location, detail }) {
  const result = await pool.query(
    `
      INSERT INTO public.user_activity_logs (user_id, action, location, detail)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, action, location, detail, created_at
    `,
    [userId, action, location || null, detail || null],
  );
  return result.rows[0];
}

module.exports = { createActivityLog };
