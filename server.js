require('dotenv').config();

const express = require('express');
const app = express();  // ✅ ต้องอยู่ตรงนี้ก่อนใช้ app.post

// === ใช้ Brevo (Sendinblue) สำหรับส่งอีเมล ===
// const nodemailer = require('nodemailer');   // ← ลบบรรทัดนี้ออก (ตามโจทย์)
const SibApiV3Sdk = require('@sendinblue/client');

// --- ★★★ แก้ไขวิธีตั้งค่า Brevo Key (ย้ายมาไว้ตรงนี้) ★★★ ---
// 1. รับ Client instance หลัก
const defaultClient = SibApiV3Sdk.ApiClient.instance;

// 2. ตั้งค่า Key บน Client instance นั้น
const apiKey = defaultClient.authentications['api-key']; // (ใช้ 'api-key' ขีดกลาง ถูกแล้ว)
apiKey.apiKey = process.env.BREVO_API_KEY;
// --- ★★★ จบส่วนแก้ไข ★★★ ---

// 3. สร้าง apiInstance (ตอนนี้มันจะดึง Key ที่ตั้งไว้มาใช้เอง)
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// --------- ★★★ DATABASE: เปลี่ยนจาก sqlite3 เป็น postgresql (pg) ★★★ -----------
const { Pool } = require('pg'); // ★★★ เพิ่มอันนี้ ★★★
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken'); // ★★★ เพิ่ม jwt ★★★

const PORT = process.env.PORT || 3000;

// === กำหนด email หลักของเว็บ ===
// เราจะใช้อีเมลนี้เป็น "ผู้ส่ง" ใน Brevo
const MAIN_EMAIL = process.env.EMAIL_USER || "dognew480@gmail.com";
const SENDER_EMAIL = process.env.BREVO_SENDER || "contact@yourdomain.com"; // เพิ่มตัวแปร sender อีเมล

// ★★★ สร้าง "Pool" เชื่อมต่อฐานข้อมูลออนไลน์ ★★★
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ตรวจสอบการเชื่อมต่อ
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to PostgreSQL database!');
  client.release();
});

// ★★★ initializeDatabase(); // --> Comment หรือลบออก (เราใช้ schema.sql แทน) ★★★

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

  // --- ★★★ ส่วนที่แก้ไข (Brevo) ★★★ ---
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: email }];
  sendSmtpEmail.sender = { name: "KeyVault", email: MAIN_EMAIL }; // ใช้อีเมลหลักของคุณเป็นผู้ส่ง
  sendSmtpEmail.subject = "🔐 KeyVault - Email Verification Code";
  sendSmtpEmail.htmlContent = `
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
  `;
  // --- ★★★ จบส่วนที่แก้ไข (Brevo) ★★★ ---

  try {
    // --- ★★★ ส่งอีเมลด้วย Brevo API ★★★ ---
    await apiInstance.sendTransacEmail(sendSmtpEmail);

    res.json({
      success: true,
      message: "ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว",
      cooldown: 60
    });
  } catch (err) {
    // (ส่วนจัดการ Error และ Cooldown ของคุณ ใช้เหมือนเดิม)
    otpManager.otpCooldown.delete(email);
    console.error("ส่งอีเมลล้มเหลว:", err);
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

// === Forgot Password === (ใช้ Brevo ในการส่งอีเมล)
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const userResult = await pool.query("SELECT id, email FROM users WHERE email = $1", [email]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "ไม่พบบัญชีนี้ในระบบ" });

    // สร้าง token สำหรับ reset (random)
    const resetToken = Math.random().toString(36).substring(2, 10);
    const expire = Date.now() + 1000 * 60 * 15; // 15 นาที

    if (!global.resetTokens) global.resetTokens = new Map();
    global.resetTokens.set(resetToken, { email, expire });

    // 🔥 แก้ไขลิงก์ให้ตรงกับชื่อไฟล์ของคุณ
    const resetLink = `http://localhost:${PORT}/reset-password.htm?token=${resetToken}`;

    // --- ★★★ ส่วนที่แก้ไข (Brevo) ★★★ ---
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.sender = { name: "KeyVault Support", email: MAIN_EMAIL };
    sendSmtpEmail.subject = "🔐 Reset your KeyVault password";
    sendSmtpEmail.htmlContent = `
      <div style="font-family:Arial;padding:16px;max-width:500px;margin:0 auto;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <h2 style="color:#1e293b;">Reset Your Password</h2>
        <p style="color:#475569;">คลิกลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่าน (ภายใน 15 นาที)</p>
        <a href="${resetLink}" style="display:inline-block;margin:15px 0;padding:12px 20px;background:#3b82f6;color:white;border-radius:6px;text-decoration:none;">Reset Password</a>
        <p style="font-size:12px;color:#64748b;">หากคุณไม่ได้ร้องขอการเปลี่ยนรหัสผ่าน โปรดละเว้นอีเมลนี้</p>
      </div>
    `;
    // --- ★★★ จบส่วนที่แก้ไข (Brevo) ★★★ ---

    try {
      // --- ★★★ ส่งอีเมลด้วย Brevo API ★★★ ---
      await apiInstance.sendTransacEmail(sendSmtpEmail);
      res.json({ success: true });
    } catch (err) {
      console.error("Email send failed:", err);
      res.status(500).json({ error: "ส่งอีเมลไม่สำเร็จ" });
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
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
  try {
    await pool.query("UPDATE users SET password = $1 WHERE email = $2", [hashed, data.email]);
    global.resetTokens.delete(token);
    res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});
// === END OTP/Email setup ===

app.use(express.static(__dirname));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// ------------ หมายเหตุ: database schema และแอดฟิลด์ ให้จัดการนอกไฟล์นี้ (schema.sql, migration tools) ------------

// Authentication middleware - now uses JWT instead of userId as token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (token == null || token === '') {
    return res.status(401).json({ error: 'Access token required' });
  }

  // --- ★★★ ใช้ jwt.verify --- ★★★
  jwt.verify(token, process.env.JWT_SECRET, (err, userPayload) => {
    if (err) {
      console.log('Invalid token:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = userPayload.userId;
    req.user = userPayload; // จะ query db ใหม่ก็ได้ แต่สำหรับตัวอย่าง demo นำข้อมูลที่ sign มาก็ได้
    console.log('Authentication successful for user:', userPayload.email);
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

// ----------- Auth Routes (PostgreSQL async/await style) --------------
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRes.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const insertUserRes = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, name]
    );
    const userId = insertUserRes.rows[0].id;

    // สร้าง default categories สำหรับ user นี้ (เปลี่ยน slug เป็น sing)
    const defaultCategories = [
      { name: 'เกม', sing: 'game' },
      { name: 'อื่นๆ', sing: 'other' }
    ];

    for (const cat of defaultCategories) {
      try {
        await pool.query(
          'INSERT INTO categories (user_id, name, sing) VALUES ($1, $2, $3)',
          [userId, cat.name, cat.sing]
        );
      } catch (err) {
        console.error('Failed to create default category:', err);
        // ไม่หยุด signup แค่ log (เหมือนเดิม)
      }
    }

    res.json({
      message: 'User created successfully',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // --- ★★★ sign JWT token แก้ไขตรงนี้ ★★★ ---
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token: token,
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

/* ====================== Categories Routes + ถังขยะหมวดหมู่ ======================== */

// ใหม่: app.get('/api/categories') รองรับ trashed
app.get('/api/categories', authenticateToken, async (req, res) => {
  const { trashed } = req.query;

  let query = 'SELECT id, name, sing as slug, deleted, deleted_at FROM categories WHERE user_id = $1';
  const params = [req.userId];

  if (trashed === '1') {
    query += ' AND deleted = true';
  } else {
    query += ' AND (deleted = false OR deleted IS NULL)';
  }

  query += ' ORDER BY name';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const slug = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, '-')
    .replace(/^-+|-+$/g, '');

  try {
    const exists = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND sing = $2',
      [req.userId, slug]
    );
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const insertRes = await pool.query(
      'INSERT INTO categories (user_id, name, sing) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, name, slug]
    );

    res.json({
      id: insertRes.rows[0].id,
      name: name,
      slug: slug,
      user_id: req.userId
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ย้ายหมวดหมู่ไปถังขยะ (Soft Delete)
app.patch('/api/categories/:slug/trash', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;
  try {
    const categoryRes = await pool.query(
      'SELECT id, name, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2',
      [categorySlug, req.userId]
    );
    const category = categoryRes.rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // 2. ย้าย codes ทั้งหมดในหมวดหมู่นี้ไปถังขยะ
    const codesRes = await pool.query(
      `UPDATE codes SET deleted = true, deleted_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 AND category = $2`,
      [req.userId, category.sing]
    );
    const codesMoved = codesRes.rowCount;

    // 3. ย้ายหมวดหมู่ไปถังขยะ (Soft Delete)
    const catTrashRes = await pool.query(
      `UPDATE categories SET deleted = true, deleted_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2`,
      [category.id, req.userId]
    );

    res.json({
      message: 'Category and all related codes moved to trash',
      categoryMoved: catTrashRes.rowCount,
      codesMoved: codesMoved
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// กู้คืนหมวดหมู่จากถังขยะ
app.post('/api/categories/:slug/restore', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;
  try {
    const categoryRes = await pool.query(
      'SELECT id, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2 AND deleted = true',
      [categorySlug, req.userId]
    );
    const category = categoryRes.rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found in trash' });
    }

    const catRestoreRes = await pool.query(
      'UPDATE categories SET deleted = false, deleted_at = NULL WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );
    const codesRestoreRes = await pool.query(
      'UPDATE codes SET deleted = false, deleted_at = NULL WHERE user_id = $1 AND category = $2',
      [req.userId, category.sing]
    );
    res.json({
      message: 'Category restored successfully',
      codesRestored: codesRestoreRes.rowCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ลบหมวดหมู่ถาวร
app.delete('/api/categories/:slug/force-delete', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;
  try {
    const categoryRes = await pool.query(
      'SELECT id, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2 AND deleted = true',
      [categorySlug, req.userId]
    );
    const category = categoryRes.rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found in trash' });
    }
    const codesDeleteRes = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND category = $2 AND deleted = true',
      [req.userId, category.sing]
    );
    const codesDeleted = codesDeleteRes.rowCount;
    const catDeleteRes = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );
    res.json({
      message: 'Category permanently deleted',
      categoryDeleted: catDeleteRes.rowCount,
      codesDeleted: codesDeleted
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// กู้คืนหมวดหมู่ทั้งหมดจากถังขยะ
app.post('/api/categories/restore-all', authenticateToken, async (req, res) => {
  try {
    const catRestoreRes = await pool.query(
      'UPDATE categories SET deleted = false, deleted_at = NULL WHERE user_id = $1 AND deleted = true',
      [req.userId]
    );
    const categoriesRestored = catRestoreRes.rowCount;
    const codesRestoreRes = await pool.query(
      'UPDATE codes SET deleted = false, deleted_at = NULL WHERE user_id = $1 AND deleted = true',
      [req.userId]
    );
    res.json({
      message: 'All categories and codes restored',
      categoriesRestored: categoriesRestored,
      codesRestored: codesRestoreRes.rowCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore all categories' });
  }
});

// ลบหมวดหมู่ทั้งหมดจากถังขยะถาวร
app.delete('/api/categories/force-delete-all', authenticateToken, async (req, res) => {
  try {
    const codesDeleteRes = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND deleted = true',
      [req.userId]
    );
    const codesDeleted = codesDeleteRes.rowCount;
    const catDeleteRes = await pool.query(
      'DELETE FROM categories WHERE user_id = $1 AND deleted = true',
      [req.userId]
    );
    res.json({
      message: 'All trash permanently deleted',
      categoriesDeleted: catDeleteRes.rowCount,
      codesDeleted: codesDeleted
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete all categories' });
  }
});

// ======= END หมวดหมู่ / ถังขยะหมวดหมู่ =======

// แก้ไข route ลบหมวดหมู่ให้ใช้ slug/name แทน id (แบบเดิม)
app.delete('/api/categories/:slug', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;

  try {
    const catRes = await pool.query(
      'SELECT id, name, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2',
      [categorySlug, req.userId]
    );
    const category = catRes.rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const codeUsingCatRes = await pool.query(
      'SELECT id FROM codes WHERE user_id = $1 AND category = $2 AND (deleted = false OR deleted IS NULL) LIMIT 1',
      [req.userId, category.sing]
    );
    const codeUsingCategory = codeUsingCatRes.rows[0];
    if (codeUsingCategory) {
      await pool.query(
        'UPDATE codes SET deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND category = $2',
        [req.userId, category.sing]
      );
      const catDeleteRes = await pool.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2',
        [category.id, req.userId]
      );
      res.json({
        message: 'Category deleted successfully. All codes in this category have been moved to trash.',
        codesMovedToTrash: catDeleteRes.rowCount
      });
    } else {
      const catDeleteRes = await pool.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2',
        [category.id, req.userId]
      );
      res.json({
        message: 'Category deleted successfully',
        categoryDeleted: catDeleteRes.rowCount
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// หรือถ้าต้องการให้ลบแบบแข็งขัน (ลบ codes ที่เกี่ยวข้องไปด้วย)
app.delete('/api/categories/:slug/force', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;
  try {
    const catRes = await pool.query(
      'SELECT id, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2',
      [categorySlug, req.userId]
    );
    const category = catRes.rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const codesDeleteRes = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND category = $2',
      [req.userId, category.sing]
    );
    const codesDeleted = codesDeleteRes.rowCount;
    const catDeleteRes = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );
    res.json({
      message: 'Category and all related codes permanently deleted',
      categoryDeleted: catDeleteRes.rowCount,
      codesDeleted: codesDeleted
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ===== ระบบถังขยะ API Routes =====

app.patch('/api/codes/:id/trash', authenticateToken, async (req, res) => {
  const codeId = req.params.id;
  try {
    const updateRes = await pool.query(
      'UPDATE codes SET deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code moved to trash' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trash code' });
  }
});

app.post('/api/codes/:id/restore', authenticateToken, async (req, res) => {
  const codeId = req.params.id;
  try {
    const restoreRes = await pool.query(
      'UPDATE codes SET deleted = false, deleted_at = NULL WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (restoreRes.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code restored' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore code' });
  }
});

app.delete('/api/codes/:id/force-delete', authenticateToken, async (req, res) => {
  const codeId = req.params.id;
  try {
    const delRes = await pool.query(
      'DELETE FROM codes WHERE id = $1 AND user_id = $2 AND deleted = true',
      [codeId, req.userId]
    );
    if (delRes.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found in trash' });
    }
    res.json({ message: 'Code permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete permanently' });
  }
});

app.post('/api/codes/restore-all', authenticateToken, async (req, res) => {
  try {
    const resRestore = await pool.query(
      'UPDATE codes SET deleted = false, deleted_at = NULL WHERE user_id = $1 AND deleted = true',
      [req.userId]
    );
    res.json({ message: 'All codes restored', restored: resRestore.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore all' });
  }
});

app.delete('/api/codes/force-delete-all', authenticateToken, async (req, res) => {
  try {
    const delRes = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND deleted = true',
      [req.userId]
    );
    res.json({ message: 'All trash permanently deleted', deleted: delRes.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete all permanently' });
  }
});

app.get('/api/codes', authenticateToken, async (req, res) => {
  const { category, search, trashed } = req.query;
  let query = 'SELECT * FROM codes WHERE user_id = $1';
  const params = [req.userId];
  let paramIndex = 2;

  if (trashed === '1') {
    query += ' AND deleted = true';
  } else {
    query += ' AND (deleted = false OR deleted IS NULL)';
  }

  if (category && category !== 'all') {
    query += ` AND category = $${paramIndex++}`;
    params.push(category);
  }

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR code ILIKE $${paramIndex + 1} OR description ILIKE $${paramIndex + 2})`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
    paramIndex += 3;
  }

  query += ' ORDER BY created_at DESC';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// --- แก้ไข app.post('/api/codes') และ app.put('/api/codes/:id') ให้ตรวจสอบ sing ---

app.post('/api/codes', authenticateToken, async (req, res) => {
  const { name, code, description, category, expires_at } = req.body;

  if (!name || !code || !category) {
    return res.status(400).json({ error: 'Name, code and category are required' });
  }

  try {
    const catRes = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND sing = $2',
      [req.userId, category]
    );
    if (catRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const insertRes = await pool.query(
      `INSERT INTO codes (user_id, name, code, description, category, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, name, code, description, category, expires_at]
    );

    res.json(insertRes.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create code' });
  }
});

// UPDATED PUT /api/codes/:id (ตรวจสอบ category ก่อนอัปเดต ใช้ sing)
app.put('/api/codes/:id', authenticateToken, async (req, res) => {
  const { name, code, description, expires_at, category } = req.body;
  const codeId = req.params.id;

  try {
    const catRes = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND sing = $2',
      [req.userId, category]
    );
    if (catRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const updateRes = await pool.query(
      `UPDATE codes SET name = $1, code = $2, description = $3, expires_at = $4, 
              category = $5, updated_at = CURRENT_TIMESTAMP 
              WHERE id = $6 AND user_id = $7`,
      [name, code, description, expires_at, category, codeId, req.userId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update code' });
  }
});

app.delete('/api/codes/:id', authenticateToken, async (req, res) => {
  const codeId = req.params.id;

  try {
    const foundRes = await pool.query(
      'SELECT id FROM codes WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (foundRes.rows.length === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }

    const delRes = await pool.query(
      'DELETE FROM codes WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (delRes.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found or already deleted' });
    }
    res.json({ message: 'Code deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete code' });
  }
});

// User profile route
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
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
