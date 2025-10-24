const express = require('express');
const app = express();  // ✅ ต้องอยู่ตรงนี้ก่อนใช้ app.post

// แก้ไข trust proxy ให้เฉพาะเจาะจง
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;

// === กำหนด email หลักของเว็บ/รหัสผ่านจาก environment variable ===
const MAIN_EMAIL = process.env.EMAIL || 'Noppanatyukun@gmail.com';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'zlcs jumf cayg wmgz';

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

// === Resend transporter setup ===
let transporter;

try {
  transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: {
      user: "resend",
      pass: process.env.RESEND_API_KEY,
    },
  });

  transporter.verify(function (error, success) {
    if (error) {
      console.error("❌ Email transporter error:", error);
    } else {
      console.log("✅ Resend transporter is ready to send emails");
    }
  });
} catch (error) {
  console.error("❌ Failed to create Resend transporter:", error);
  transporter = null;
}

// === ส่ง OTP ไปยังอีเมล (with cooldown & prettier email) ด้วย otpManager ===
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  console.log('📧 OTP Request for:', email);

  // ตรวจสอบ cooldown
  const cooldown = otpManager.checkCooldown(email);
  if (cooldown.cooldown) {
    console.log('⏳ OTP Cooldown for:', email, cooldown.remaining);
    return res.status(429).json({
      error: `กรุณารอ ${cooldown.remaining} วินาทีก่อนขอ OTP ใหม่`,
      cooldown: cooldown.remaining
    });
  }

  // ตั้งค่า cooldown
  otpManager.setCooldown(email);
  const otp = otpManager.generateOtp(email);

  console.log('🔐 Generated OTP:', otp, 'for:', email);

  try {
    console.log('📤 Attempting to send email...');
    
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

    console.log('✅ OTP Email sent successfully to:', email);
    
    res.json({
      success: true,
      message: "ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว",
      cooldown: 60
    });
  } catch (err) {
    // ลบ cooldown ถ้าส่งไม่สำเร็จ
    otpManager.otpCooldown.delete(email);

    console.error("❌ OTP Email failed:", err.message);
    console.error("Full error:", err);
    
    res.status(500).json({ 
      error: "ส่งอีเมลไม่สำเร็จ",
      debug: err.message 
    });
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

// Debug endpoint to check current OTPs
app.get("/api/debug/otp-store", (req, res) => {
  const otps = [];
  for (const [email, data] of otpManager.otpStore.entries()) {
    otps.push({
      email: email,
      otp: data.otp,
      expire: new Date(data.expire).toISOString(),
      attempts: data.attempts
    });
  }
  
  res.json({
    otp_count: otpManager.otpStore.size,
    cooldown_count: otpManager.otpCooldown.size,
    otps: otps
  });
});

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

// ----------- EMAIL DEBUG ENDPOINTS (inserted here) ------------------

// เพิ่ม endpoint ตรวจสอบ email configuration
app.get("/api/debug/email-config", (req, res) => {
  const config = {
    EMAIL: process.env.EMAIL || 'Not set',
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set',
    MAIN_EMAIL: MAIN_EMAIL,
    has_transporter: !!transporter
  };
  
  console.log('📧 Email Config:', config);
  res.json(config);
});

// เพิ่ม endpoint ทดสอบส่งอีเมล
app.get("/api/debug/test-email", async (req, res) => {
  try {
    const testEmail = "test@example.com"; // เปลี่ยนเป็นอีเมลของคุณ
    const otp = "123456";
    
    await transporter.sendMail({
      from: `"KeyVault Test" <${MAIN_EMAIL}>`,
      to: testEmail,
      subject: "🔐 KeyVault - Test Email",
      html: `<h1>Test OTP: ${otp}</h1>`,
    });

    res.json({ success: true, message: "Test email sent" });
  } catch (err) {
    console.error("Test email failed:", err);
    res.status(500).json({ error: err.message });
  }
});
// ------------------- END EMAIL DEBUG ENDPOINTS ------------------

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

// ... (rest of file unchanged)