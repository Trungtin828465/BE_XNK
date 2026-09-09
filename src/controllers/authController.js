const pool = require('../config/database');
const bcrypt = require('bcrypt');

const PASSWORD_SALT_ROUNDS = 12;

function isBcryptHash(value) {
  return /^\$2[aby]?\$\d{2}\$/.test(String(value || ''));
}

async function verifyPassword(inputPassword, storedPassword) {
  const input = String(inputPassword || '');
  const stored = String(storedPassword || '');

  if (isBcryptHash(stored)) {
    return bcrypt.compare(input, stored);
  }

  // Tương thích tài khoản cũ đang lưu plain text.
  return input === stored;
}

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
    const storedPasswordIsHash = isBcryptHash(user.password);

    if (storedPasswordIsHash) {
      passwordMatches = await verifyPassword(password, user.password);
    } else {
      // Tương thích dữ liệu cũ đang lưu plain text và tự chuyển sang bcrypt.
      passwordMatches = password === user.password;
      if (passwordMatches) {
        const passwordHash = await bcrypt.hash(String(password), PASSWORD_SALT_ROUNDS);
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

async function register(req, res) {
  const { name, username, password, role = 'user', session = 'view' } = req.body || {};

  if (!name || !username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập name, username và password',
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu phải có ít nhất 6 ký tự',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), PASSWORD_SALT_ROUNDS);
    const result = await pool.query(
      `
        INSERT INTO public.users (name, username, password, role, session)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, username, role, session, created_at
      `,
      [String(name).trim(), String(username).trim(), passwordHash, String(role), String(session)],
    );

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Username đã tồn tại',
      });
    }

    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể đăng ký tài khoản',
      error: error.message,
    });
  }
}

async function getUsers(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT id, name, username, role, session, created_at
        FROM public.users
        ORDER BY id ASC
      `,
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách user',
      error: error.message,
    });
  }
}

async function getUserById(req, res) {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: 'id user không hợp lệ',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT id, name, username, role, session, created_at
        FROM public.users
        WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin user',
      error: error.message,
    });
  }
}

async function updateUser(req, res) {
  const userId = Number(req.params.id);
  const { name, username, password, role, session } = req.body || {};

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: 'id user không hợp lệ',
    });
  }

  const fields = [];
  const values = [];
  const addField = (column, value) => {
    if (value !== undefined) {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    }
  };

  addField('name', name === undefined ? undefined : String(name).trim());
  addField('username', username === undefined ? undefined : String(username).trim());
  addField('role', role === undefined ? undefined : String(role).trim());
  addField('session', session === undefined ? undefined : String(session).trim());

  if (password !== undefined) {
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự',
      });
    }
    addField('password', await bcrypt.hash(String(password), PASSWORD_SALT_ROUNDS));
  }

  if (fields.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Không có dữ liệu cần cập nhật',
    });
  }

  values.push(userId);

  try {
    const result = await pool.query(
      `
        UPDATE public.users
        SET ${fields.join(', ')}
        WHERE id = $${values.length}
        RETURNING id, name, username, role, session, created_at
      `,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cập nhật user thành công',
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Username đã tồn tại',
      });
    }

    console.error('Update user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể cập nhật user',
      error: error.message,
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
  register,
  getUsers,
  getUserById,
  updateUser,
  updatePassword,
};
