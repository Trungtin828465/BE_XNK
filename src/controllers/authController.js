const pool = require('../config/database');
const bcrypt = require('bcrypt');

const PASSWORD_SALT_ROUNDS = 12;

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
      SELECT id, name, username, password, role, session
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

    let passwordMatches = false;
    const isBcryptHash = /^\$2[aby]?\$\d{2}\$/.test(user.password || '');

    if (isBcryptHash) {
      passwordMatches = await bcrypt.compare(password, user.password);
    } else {
      // Tương thích dữ liệu cũ đang lưu plain text và tự chuyển sang bcrypt.
      passwordMatches = password === user.password;
      if (passwordMatches) {
        const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
        await pool.query(
          'UPDATE public.users SET password = $1 WHERE id = $2',
          [passwordHash, user.id],
        );
      }
    }

    if (!passwordMatches) {
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
        role: user.role,
        session: user.session,
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

async function updatePassword(req, res) {
  const { username, newPassword, password } = req.body || {};
  const nextPassword = newPassword || password;

  if (!username || !nextPassword) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập username và mật khẩu mới',
    });
  }

  if (String(nextPassword).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(String(nextPassword), PASSWORD_SALT_ROUNDS);
    const result = await pool.query(
      `
        UPDATE public.users
        SET password = $1
        WHERE username = $2
        RETURNING id, name, username, role, session
      `,
      [passwordHash, String(username).trim()],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cập nhật mật khẩu thành công',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể cập nhật mật khẩu',
      error: error.message,
    });
  }
}

module.exports = {
  login,
  updatePassword,
};
