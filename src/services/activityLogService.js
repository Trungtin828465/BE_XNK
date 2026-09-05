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

async function getActivityLogs({ userId, limit = 100, offset = 0 } = {}) {
  const values = [];
  const conditions = [];

  if (userId !== undefined && userId !== null) {
    values.push(userId);
    conditions.push(`logs.user_id = $${values.length}`);
  }

  values.push(limit);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `
      SELECT
        logs.id,
        logs.user_id,
        users.name,
        users.username,
        users.role,
        users.session,
        logs.action,
        logs.location,
        logs.detail,
        logs.created_at
      FROM public.user_activity_logs AS logs
      INNER JOIN public.users AS users ON users.id = logs.user_id
      ${whereClause}
      ORDER BY logs.created_at DESC, logs.id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `,
    values,
  );

  return result.rows;
}

module.exports = { createActivityLog, getActivityLogs };
