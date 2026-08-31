const pool = require('../config/database');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập username và password'
      });
    }

    const result = await pool.query(
      `
      SELECT id, name, username, password, role
      FROM public.users
      WHERE username = $1
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Username hoặc password không đúng'
      });
    }

    const user = result.rows[0];

    // So sánh password trực tiếp
    if (password !== user.password) {
      return res.status(401).json({
        success: false,
        message: 'Username hoặc password không đúng'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
}

module.exports = {
  login
};
