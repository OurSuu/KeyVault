const express = require('express');
const app = express();  // ✅ ต้องอยู่ตรงนี้ก่อนใช้ app.post

const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;

// === กำหนด email หลักของเว็บ ===
const MAIN_EMAIL = 'Noppanatyukun@gmail.com';

// ====== Middleware (ขึ้นบนสุด ก่อนทุก route) ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === OTP/Email Routes: Improved OtpManager Usage ===

class OtpManager {
  constructor() {
    this.otpStore = new Map();
    this.otpCooldown = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // cleanup every 5 min
  }

  generateOtp(email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otpStore.set(email, {
      otp,
      expire: Date.now() + 5 * 60 * 1000, // 5 mins
      attempts: 0
    });
    return otp;
  }

  verifyOtp(email, otp) {
    const record = this.otpStore.get(email);
    if (!record) return { valid: false, error: "ไม่พบรหัส OTP นี้" };

    if (record.expire < Date.now()) {
      this.otpStore.delete(email);
      return { valid: false, error: "รหัสหมดอายุแล้ว" };
    }

    // จำกัดจำนวนครั้งที่ลอง
    record.attempts++;
    if (record.attempts > 5) {
      this.otpStore.delete(email);
      return { valid: false, error: "ลองรหัสเกินจำนวนที่กำหนด" };
    }

    if (record.otp !== otp) {
      return { valid: false, error: "รหัส OTP ไม่ถูกต้อง" };
    }

    this.otpStore.delete(email);
    return { valid: true };
  }

  setCooldown(email) {
    this.otpCooldown.set(email, Date.now());
  }

  checkCooldown(email) {
    const lastRequest = this.otpCooldown.get(email);
    if (!lastRequest) return { cooldown: false };

    const now = Date.now();
    if (now - lastRequest < 60000) {
      return {
        cooldown: true,
        remaining: Math.ceil((60000 - (now - lastRequest)) / 1000)
      };
    }
    this.otpCooldown.delete(email);
    return { cooldown: false };
  }

  cleanup() {
    const now = Date.now();
    // Remove expired otps
    for (const [email, record] of this.otpStore.entries()) {
      if (record.expire < now) {
        this.otpStore.delete(email);
      }
    }
    // Remove expired cooldowns
    for (const [email, timestamp] of this.otpCooldown.entries()) {
      if (now - timestamp >= 60000) {
        this.otpCooldown.delete(email);
      }
    }
  }
}

const otpManager = new OtpManager();

// --- transporter must be defined BEFORE using it in any forgot-password/reset logic ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: MAIN_EMAIL,  // ใช้ email หลักของเว็บ
    pass: "zlcs jumf cayg wmgz",  // ← ใช้ App Password (ไม่ใช่รหัส Gmail ปกติ)
  },
});

// === ส่ง OTP ไปยังอีเมล (with cooldown & prettier email) ด้วย otpManager ===
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  // ตรวจสอบ cooldown
  const cooldown = otpManager.checkCooldown(email);
  if (cooldown.cooldown) {
    return res.status(429).json({
      error: `กรุณารอ ${cooldown.remaining} วินาทีก่อนขอ OTP ใหม่`,
      cooldown: cooldown.remaining
    });
  }

  // ตั้งค่า cooldown
  otpManager.setCooldown(email);

  const otp = otpManager.generateOtp(email);

  try {
    await transporter.sendMail({
      from: `"KeyVault" <${MAIN_EMAIL}>`,
      to: email,
      subject: "🔐 KeyVault - Email Verification Code",
      html: `
        <div style="font-family:Arial;padding:16px;max-width:500px;margin:0 auto;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">🔐 KeyVault</h1>
          </div>
          <div style="padding:20px;">
            <h2 style="color:#1e293b;margin-top:0;">ยืนยันอีเมลของคุณ</h2>
            <p style="color:#475569;font-size:16px;line-height:1.5;">กรุณาใช้รหัสยืนยันด้านล่างเพื่อดำเนินการสมัครบัญชี KeyVault:</p>
            <div style="background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:8px;padding:15px;text-align:center;margin:20px 0;">
              <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e293b;">${otp}</div>
            </div>
            <p style="color:#64748b;font-size:14px;text-align:center;">
              ⚠️ รหัสนี้จะหมดอายุใน 5 นาที<br>
              ❌ หากคุณไม่ได้ขอรหัสนี้ กรุณาเพิกเฉยต่ออีเมลนี้
            </p>
          </div>
          <div style="background:#f1f5f9;padding:15px;border-radius:0 0 8px 8px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#64748b;font-size:12px;margin:0;">
              © ${new Date().getFullYear()} KeyVault. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว",
      cooldown: 60
    });
  } catch (err) {
    // ลบ cooldown ถ้าส่งไม่สำเร็จ
    // (ใน otpManager จะ expire เองใน 1 นาทีรอบ cleanup แต่จะรีเซตทันทีดีกว่า)
    otpManager.otpCooldown.delete(email);

    console.error("ส่งอีเมลล้มเหลว:", err);
    if (err && err.stack) {
      console.error('Stack trace:', err.stack);
    }
    res.status(500).json({ error: "ส่งอีเมลไม่สำเร็จ" });
  }
});

// เพิ่ม endpoint สำหรับตรวจสอบ cooldown OTP
app.get("/api/auth/cooldown/:email", (req, res) => {
  const { email } = req.params;
  const cooldown = otpManager.checkCooldown(email);
  if (cooldown.cooldown) {
    return res.json({
      cooldown: true,
      remaining: cooldown.remaining
    });
  }
  res.json({ cooldown: false });
});

// === ตรวจสอบ OTP (ปรับใช้ otpManager) ===
app.post("/api/auth/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const result = otpManager.verifyOtp(email, otp);

  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});

// === Forgot Password === (ต้องอยู่หลัง transporter สร้างแล้วเท่านั้น)
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  db.get("SELECT id, email FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "ไม่พบบัญชีนี้ในระบบ" });

    // สร้าง token สำหรับ reset (random)
    const resetToken = Math.random().toString(36).substring(2, 10);
    const expire = Date.now() + 1000 * 60 * 15; // 15 นาที

    if (!global.resetTokens) global.resetTokens = new Map();
    global.resetTokens.set(resetToken, { email, expire });

    // 🔥 แก้ไขลิงก์ให้ตรงกับชื่อไฟล์ของคุณ
    const resetLink = `http://localhost:${PORT}/reset-password.htm?token=${resetToken}`;

    try {
      await transporter.sendMail({
        from: `"KeyVault Support" <${MAIN_EMAIL}>`,
        to: email,
        subject: "🔐 Reset your KeyVault password",
        html: `
          <div style="font-family:Arial;padding:16px;max-width:500px;margin:0 auto;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1e293b;">Reset Your Password</h2>
            <p style="color:#475569;">คลิกลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่านของคุณ (ภายใน 15 นาที)</p>
            <a href="${resetLink}" style="display:inline-block;margin:15px 0;padding:12px 20px;background:#3b82f6;color:white;border-radius:6px;text-decoration:none;">Reset Password</a>
            <p style="font-size:12px;color:#64748b;">หากคุณไม่ได้ร้องขอการเปลี่ยนรหัสผ่าน โปรดละเว้นอีเมลนี้</p>
          </div>
        `,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Email send failed:", err);
      res.status(500).json({ error: "ส่งอีเมลไม่สำเร็จ" });
    }
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });

  const data = global.resetTokens?.get(token);
  if (!data) return res.status(400).json({ error: "โทเค็นไม่ถูกต้องหรือหมดอายุ" });
  if (Date.now() > data.expire) {
    global.resetTokens.delete(token);
    return res.status(400).json({ error: "โทเค็นหมดอายุ" });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  db.run("UPDATE users SET password = ? WHERE email = ?", [hashed, data.email], (err) => {
    if (err) return res.status(500).json({ error: "Database error" });
    global.resetTokens.delete(token);
    res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  });
});
// === END OTP/Email setup ===

app.use(express.static(__dirname));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Database initialization
const db = new sqlite3.Database('./keyvault.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
    // ===== ระบบถังขยะ เพิ่ม field deleted, deleted_at ถ้ายังไม่มี =====
    db.run(`ALTER TABLE codes ADD COLUMN deleted BOOLEAN DEFAULT 0`, (err) => {
      if (err) {
        console.log('Field deleted might already exist');
      }
    });
    db.run(`ALTER TABLE codes ADD COLUMN deleted_at DATETIME`, (err) => {
      if (err) {
        console.log('Field deleted_at might already exist');
      }
    });
    // เพิ่ม deleted, deleted_at ใน categories ถ้ายังไม่มี
    db.run(`ALTER TABLE categories ADD COLUMN deleted BOOLEAN DEFAULT 0`, (err) => {
      if (err) {
        console.log('Field deleted (categories) might already exist');
      }
    });
    db.run(`ALTER TABLE categories ADD COLUMN deleted_at DATETIME`, (err) => {
      if (err) {
        console.log('Field deleted_at (categories) might already exist');
      }
    });
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Categories table - ใช้ sing แทน slug
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sing TEXT NOT NULL,  -- เปลี่ยนเป็น sing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  )`);

  // Codes table
  db.run(`CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )`);

  // เปิดใช้ Foreign Keys
  db.run('PRAGMA foreign_keys = ON');
}

// Authentication middleware - rewritten for debug header logging and clearer structure
const authenticateToken = (req, res, next) => {
  let authHeader = req.headers['authorization'];

  // 🔍 DEBUG: Log all headers
  console.log('🔍 ALL HEADERS:', req.headers);
  console.log('🔍 AUTH HEADER:', authHeader);

  if (!authHeader) {
    console.log('❌ No authorization header found');
    return res.status(401).json({ error: 'Access token required' });
  }

  authHeader = String(authHeader).trim();

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    token = authHeader;
  }

  console.log('🔍 EXTRACTED TOKEN:', token);

  if (!token) {
    console.log('❌ Token is empty after extraction');
    return res.status(401).json({ error: 'Access token required' });
  }

  // ในระบบนี้ token คือ id ของ user (ไม่มีการ sign/jwt จริง)
  const userId = parseInt(token, 10);
  if (isNaN(userId) || !isFinite(userId)) {
    console.log('Invalid token format:', token);
    return res.status(401).json({ error: 'Invalid token' });
  }

  db.get('SELECT id, email FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Database error in auth:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      console.log('No user found for token:', token);
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = userId;
    req.user = user;
    console.log('Authentication successful for user:', user.email);
    next();
  });
};

// เพิ่ม route สำหรับ debug token
app.get('/api/debug/auth', authenticateToken, (req, res) => {
  res.json({
    message: 'Token is valid',
    user: req.user,
    userId: req.userId
  });
});

// Route สำหรับตรวจสอบ token โดยไม่ต้อง authentication
app.get('/api/debug/token-check', (req, res) => {
  let authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string') authHeader = '';
  authHeader = authHeader.trim();

  let token = '';
  if (authHeader.length === 0) {
    token = '';
  } else if (/^Bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  } else {
    token = authHeader;
  }

  res.json({
    authHeader: authHeader,
    token: token,
    tokenType: typeof token,
    tokenLength: token ? token.length : 0
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'LoginIndex.htm'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'mainIndex.htm'));
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (row) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
        [email, hashedPassword, name], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create user' });
        }

        const userId = this.lastID;

        // สร้าง default categories สำหรับ user นี้ (เปลี่ยน slug เป็น sing)
        const defaultCategories = [
          { name: 'เกม', sing: 'game' },
          { name: 'อื่นๆ', sing: 'other' }
        ];

        let categoriesCreated = 0;
        defaultCategories.forEach(cat => {
          db.run('INSERT INTO categories (user_id, name, sing) VALUES (?, ?, ?)',
            [userId, cat.name, cat.sing], function(err) {
            if (err) {
              // แค่ log error เฉยๆ ไม่ block การสมัคร
              console.error('Failed to create default category:', err);
            }
            categoriesCreated++;

            // เมื่อสร้าง categories ครบทั้งหมดแล้วค่อย response
            if (categoriesCreated === defaultCategories.length) {
              res.json({ 
                message: 'User created successfully',
                userId: userId
              });
            }
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    try {
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      res.json({
        message: 'Login successful',
        token: user.id.toString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
});

/* ====================== Categories Routes + ถังขยะหมวดหมู่ ======================== */

// ใหม่: app.get('/api/categories') รองรับ trashed
app.get('/api/categories', authenticateToken, (req, res) => {
  const { trashed } = req.query;
  
  let query = 'SELECT id, name, sing as slug, deleted, deleted_at FROM categories WHERE user_id = ?';
  let params = [req.userId];

  // กรองตามสถานะถังขยะ
  if (trashed === '1') {
    query += ' AND deleted = 1';
  } else {
    query += ' AND (deleted = 0 OR deleted IS NULL)';
  }

  query += ' ORDER BY name';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

app.post('/api/categories', authenticateToken, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const slug = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // เปลี่ยนจาก slug เป็น sing
  db.get('SELECT id FROM categories WHERE user_id = ? AND sing = ?', 
    [req.userId, slug], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (existing) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    // เปลี่ยนจาก slug เป็น sing
    db.run('INSERT INTO categories (user_id, name, sing) VALUES (?, ?, ?)', 
      [req.userId, name, slug], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create category' });
      }

      res.json({ 
        id: this.lastID,
        name: name,
        slug: slug,
        user_id: req.userId
      });
    });
  });
});

// ย้ายหมวดหมู่ไปถังขยะ (Soft Delete)
app.patch('/api/categories/:slug/trash', authenticateToken, (req, res) => {
  const categorySlug = req.params.slug;
  db.get(
    'SELECT id, name, sing FROM categories WHERE (sing = ? OR name = ?) AND user_id = ?',
    [categorySlug, categorySlug, req.userId],
    (err, category) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      // 2. ย้าย codes ทั้งหมดในหมวดหมู่นี้ไปถังขยะ
      db.run(
        'UPDATE codes SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = ?',
        [req.userId, category.sing],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to move codes to trash' });
          }
          const codesMoved = this.changes;
          // 3. ย้ายหมวดหมู่ไปถังขยะ (Soft Delete)
          db.run(
            'UPDATE categories SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [category.id, req.userId],
            function(err) {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to trash category' });
              }
              res.json({ 
                message: 'Category and all related codes moved to trash',
                categoryMoved: this.changes,
                codesMoved: codesMoved
              });
            }
          );
        }
      );
    }
  );
});

// กู้คืนหมวดหมู่จากถังขยะ
app.post('/api/categories/:slug/restore', authenticateToken, (req, res) => {
  const categorySlug = req.params.slug;
  db.get(
    'SELECT id, sing FROM categories WHERE (sing = ? OR name = ?) AND user_id = ? AND deleted = 1',
    [categorySlug, categorySlug, req.userId],
    (err, category) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!category) {
        return res.status(404).json({ error: 'Category not found in trash' });
      }
      db.run(
        'UPDATE categories SET deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?',
        [category.id, req.userId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to restore category' });
          }
          // กู้คืน codes ที่เกี่ยวข้อง
          db.run(
            'UPDATE codes SET deleted = 0, deleted_at = NULL WHERE user_id = ? AND category = ?',
            [req.userId, category.sing],
            function(err) {
              if (err) {
                console.error('Failed to restore related codes:', err);
              }
              res.json({ 
                message: 'Category restored successfully',
                codesRestored: this.changes
              });
            }
          );
        }
      );
    }
  );
});

// ลบหมวดหมู่ถาวร
app.delete('/api/categories/:slug/force-delete', authenticateToken, (req, res) => {
  const categorySlug = req.params.slug;
  db.get(
    'SELECT id, sing FROM categories WHERE (sing = ? OR name = ?) AND user_id = ? AND deleted = 1',
    [categorySlug, categorySlug, req.userId],
    (err, category) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!category) {
        return res.status(404).json({ error: 'Category not found in trash' });
      }
      // ลบ codes ที่เกี่ยวข้องถาวร
      db.run(
        'DELETE FROM codes WHERE user_id = ? AND category = ? AND deleted = 1',
        [req.userId, category.sing],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete related codes' });
          }
          const codesDeleted = this.changes;
          // ลบหมวดหมู่ถาวร
          db.run(
            'DELETE FROM categories WHERE id = ? AND user_id = ?',
            [category.id, req.userId],
            function(err) {
              if (err) {
                return res.status(500).json({ error: 'Failed to delete category' });
              }
              res.json({ 
                message: 'Category permanently deleted',
                categoryDeleted: this.changes,
                codesDeleted: codesDeleted
              });
            }
          );
        }
      );
    }
  );
});

// กู้คืนหมวดหมู่ทั้งหมดจากถังขยะ
app.post('/api/categories/restore-all', authenticateToken, (req, res) => {
  // กู้คืนหมวดหมู่ทั้งหมด
  db.run(
    'UPDATE categories SET deleted = 0, deleted_at = NULL WHERE user_id = ? AND deleted = 1',
    [req.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to restore all categories' });
      }
      const categoriesRestored = this.changes;
      // กู้คืน codes ทั้งหมดในถังขยะ
      db.run(
        'UPDATE codes SET deleted = 0, deleted_at = NULL WHERE user_id = ? AND deleted = 1',
        [req.userId],
        function(err) {
          if (err) {
            console.error('Failed to restore all codes:', err);
          }
          res.json({ 
            message: 'All categories and codes restored',
            categoriesRestored: categoriesRestored,
            codesRestored: this.changes
          });
        }
      );
    }
  );
});

// ลบหมวดหมู่ทั้งหมดจากถังขยะถาวร
app.delete('/api/categories/force-delete-all', authenticateToken, (req, res) => {
  // ลบ codes ทั้งหมดในถังขยะ
  db.run(
    'DELETE FROM codes WHERE user_id = ? AND deleted = 1',
    [req.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete all codes' });
      }
      const codesDeleted = this.changes;
      // ลบหมวดหมู่ทั้งหมดในถังขยะ
      db.run(
        'DELETE FROM categories WHERE user_id = ? AND deleted = 1',
        [req.userId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete all categories' });
          }
          res.json({ 
            message: 'All trash permanently deleted',
            categoriesDeleted: this.changes,
            codesDeleted: codesDeleted
          });
        }
      );
    }
  );
});

// ======= END หมวดหมู่ / ถังขยะหมวดหมู่ =======

// แก้ไข route ลบหมวดหมู่ให้ใช้ slug/name แทน id (แบบเดิม)
app.delete('/api/categories/:slug', authenticateToken, (req, res) => {
  const categorySlug = req.params.slug;

  db.get(
    'SELECT id, name, sing FROM categories WHERE (sing = ? OR name = ?) AND user_id = ?',
    [categorySlug, categorySlug, req.userId],
    (err, category) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      db.get(
        'SELECT id FROM codes WHERE user_id = ? AND category = ? AND (deleted = 0 OR deleted IS NULL) LIMIT 1',
        [req.userId, category.sing],
        (err, codeUsingCategory) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          if (codeUsingCategory) {
            db.run(
              'UPDATE codes SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = ?',
              [req.userId, category.sing],
              function(err) {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ error: 'Failed to move codes to trash' });
                }
                db.run(
                  'DELETE FROM categories WHERE id = ? AND user_id = ?',
                  [category.id, req.userId],
                  function(err) {
                    if (err) {
                      console.error('Database error:', err);
                      return res.status(500).json({ error: 'Failed to delete category' });
                    }
                    res.json({ 
                      message: 'Category deleted successfully. All codes in this category have been moved to trash.',
                      codesMovedToTrash: this.changes
                    });
                  }
                );
              }
            );
          } else {
            db.run(
              'DELETE FROM categories WHERE id = ? AND user_id = ?',
              [category.id, req.userId],
              function(err) {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ error: 'Failed to delete category' });
                }
                res.json({ 
                  message: 'Category deleted successfully',
                  categoryDeleted: this.changes
                });
              }
            );
          }
        }
      );
    }
  );
});

// หรือถ้าต้องการให้ลบแบบแข็งขัน (ลบ codes ที่เกี่ยวข้องไปด้วย)
app.delete('/api/categories/:slug/force', authenticateToken, (req, res) => {
  const categorySlug = req.params.slug;

  db.get(
    'SELECT id, sing FROM categories WHERE (sing = ? OR name = ?) AND user_id = ?',
    [categorySlug, categorySlug, req.userId],
    (err, category) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      db.run(
        'DELETE FROM codes WHERE user_id = ? AND category = ?',
        [req.userId, category.sing],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete related codes' });
          }
          const codesDeleted = this.changes;
          db.run(
            'DELETE FROM categories WHERE id = ? AND user_id = ?',
            [category.id, req.userId],
            function(err) {
              if (err) {
                return res.status(500).json({ error: 'Failed to delete category' });
              }
              res.json({ 
                message: 'Category and all related codes permanently deleted',
                categoryDeleted: this.changes,
                codesDeleted: codesDeleted
              });
            }
          );
        }
      );
    }
  );
});

// ===== ระบบถังขยะ API Routes =====

app.patch('/api/codes/:id/trash', authenticateToken, (req, res) => {
  const codeId = req.params.id;
  
  db.run('UPDATE codes SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [codeId, req.userId], function(err) {
    if (err) {
      console.error('Database error in trash:', err);
      return res.status(500).json({ error: 'Failed to trash code' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code moved to trash' });
  });
});

app.post('/api/codes/:id/restore', authenticateToken, (req, res) => {
  const codeId = req.params.id;
  
  db.run('UPDATE codes SET deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?',
    [codeId, req.userId], function(err) {
    if (err) {
      console.error('Database error in restore:', err);
      return res.status(500).json({ error: 'Failed to restore code' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code restored' });
  });
});

app.delete('/api/codes/:id/force-delete', authenticateToken, (req, res) => {
  const codeId = req.params.id;
  
  db.run('DELETE FROM codes WHERE id = ? AND user_id = ? AND deleted = 1',
    [codeId, req.userId], function(err) {
    if (err) {
      console.error('Database error in force-delete:', err);
      return res.status(500).json({ error: 'Failed to delete permanently' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Code not found in trash' });
    }
    res.json({ message: 'Code permanently deleted' });
  });
});

app.post('/api/codes/restore-all', authenticateToken, (req, res) => {
  db.run('UPDATE codes SET deleted = 0, deleted_at = NULL WHERE user_id = ? AND deleted = 1',
    [req.userId], function(err) {
    if (err) {
      console.error('Database error in restore-all:', err);
      return res.status(500).json({ error: 'Failed to restore all' });
    }
    res.json({ message: 'All codes restored', restored: this.changes });
  });
});

app.delete('/api/codes/force-delete-all', authenticateToken, (req, res) => {
  db.run('DELETE FROM codes WHERE user_id = ? AND deleted = 1',
    [req.userId], function(err) {
    if (err) {
      console.error('Database error in force-delete-all:', err);
      return res.status(500).json({ error: 'Failed to delete all permanently' });
    }
    res.json({ message: 'All trash permanently deleted', deleted: this.changes });
  });
});

app.get('/api/codes', authenticateToken, (req, res) => {
  const { category, search, trashed } = req.query;
  let query = 'SELECT * FROM codes WHERE user_id = ?';
  let params = [req.userId];

  // ตรวจสอบว่าต้องการดูถังขยะหรือข้อมูลปกติ
  if (trashed === '1') {
    query += ' AND deleted = 1';
  } else {
    query += ' AND (deleted = 0 OR deleted IS NULL)';
  }

  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error in get codes:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// --- แก้ไข app.post('/api/codes') และ app.put('/api/codes/:id') ให้ตรวจสอบ sing ---

app.post('/api/codes', authenticateToken, (req, res) => {
  const { name, code, description, category, expires_at } = req.body;

  if (!name || !code || !category) {
    return res.status(400).json({ error: 'Name, code and category are required' });
  }

  // เปลี่ยนจาก slug เป็น sing: ตรวจสอบ category โดยใช้ sing
  db.get('SELECT id FROM categories WHERE user_id = ? AND sing = ?', [req.userId, category], (err, categoryRow) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!categoryRow) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    db.run(`INSERT INTO codes (user_id, name, code, description, category, expires_at) 
            VALUES (?, ?, ?, ?, ?, ?)`, 
      [req.userId, name, code, description, category, expires_at], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to create code' });
      }

      db.get('SELECT * FROM codes WHERE id = ? AND user_id = ?', [this.lastID, req.userId], (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(row);
      });
    });
  });
});

// UPDATED PUT /api/codes/:id (ตรวจสอบ category ก่อนอัปเดต ใช้ sing)
app.put('/api/codes/:id', authenticateToken, (req, res) => {
  const { name, code, description, expires_at, category } = req.body;
  const codeId = req.params.id;

  db.get('SELECT id FROM categories WHERE user_id = ? AND sing = ?', [req.userId, category], (err, categoryRow) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!categoryRow) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    db.run(`UPDATE codes SET name = ?, code = ?, description = ?, expires_at = ?, 
            category = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND user_id = ?`,
      [name, code, description, expires_at, category, codeId, req.userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update code' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Code not found' });
      }
      res.json({ message: 'Code updated successfully' });
    });
  });
});

app.delete('/api/codes/:id', authenticateToken, (req, res) => {
  const codeId = req.params.id;

  db.get('SELECT id FROM codes WHERE id = ? AND user_id = ?', [codeId, req.userId], (err, found) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!found) {
      return res.status(404).json({ error: 'Code not found' });
    }

    db.run('DELETE FROM codes WHERE id = ? AND user_id = ?', [codeId, req.userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete code' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Code not found or already deleted' });
      }
      res.json({ message: 'Code deleted successfully' });
    });
  });
});

// User profile route
app.get('/api/user/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, email, name, created_at FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'LoginIndex.htm'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Login page: http://localhost:${PORT}/`);
  console.log(`Main page: http://localhost:${PORT}/main`);
});