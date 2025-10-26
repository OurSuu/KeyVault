const express = require('express');
const app = express();  // ✅ ต้องอยู่ตรงนี้ก่อนใช้ app.post

// ====== Brevo API Client Setup ======
const SibApiV3Sdk = require('@getbrevo/brevo');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY; // ← นี่คือการเชื่อมกับ Render Env

const brevoApi = new SibApiV3Sdk.TransactionalEmailsApi();
// ======================================

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;

// === กำหนด email หลักของเว็บ ===
const MAIN_EMAIL = 'dognew480@gmail.com';

// ====== Middleware (ขึ้นบนสุด ก่อนทุก route) ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 (เพิ่มบรรทัดนี้) บอก Express ให้เชื่อถือ Proxy (สำหรับ Render/Rate Limiter)
app.set('trust proxy', 1);

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

// === เตรียม Pool สำหรับ PostgreSQL ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// === Function มาตรฐานสำหรับ async pool.query (ใช้สำหรับ db โฉมใหม่) ===
const runQuery = async (text, params) => {
  const result = await pool.query(text, params);
  return result;
};

// === initialize database and migration logic ===
async function initializeDatabase() {
  // Users table
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Categories table - ใช้ sing แทน slug
  await pool.query(`CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sing TEXT NOT NULL,  -- เปลี่ยนเป็น sing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  )`);

  // Codes table
  await pool.query(`CREATE TABLE IF NOT EXISTS codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )`);

  // ===== ระบบถังขยะ เพิ่ม field deleted, deleted_at ถ้ายังไม่มี =====
  // (Postgres จะ error อยู่ดีแต่ไม่ต้องห่วง/แค่ log)
  try {
    await pool.query(`ALTER TABLE codes ADD COLUMN deleted BOOLEAN DEFAULT FALSE`);
  } catch (e) {}
  try {
    await pool.query(`ALTER TABLE codes ADD COLUMN deleted_at TIMESTAMP`);
  } catch (e) {}
  try {
    await pool.query(`ALTER TABLE categories ADD COLUMN deleted BOOLEAN DEFAULT FALSE`);
  } catch (e) {}
  try {
    await pool.query(`ALTER TABLE categories ADD COLUMN deleted_at TIMESTAMP`);
  } catch (e) {}
}

// เริ่ม Initialize DB
initializeDatabase()
  .then(() => {
    console.log('Connected to PostgreSQL database');
  })
  .catch(err => {
    console.error('Error initialising database:', err);
  });

// ===== ส่วน Authentication Middleware =====
const authenticateToken = async (req, res, next) => {
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

  try {
    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) {
      console.log('No user found for token:', token);
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = userId;
    req.user = user;
    console.log('Authentication successful for user:', user.email);
    next();
  } catch (err) {
    console.error('Database error in auth:', err);
    return res.status(500).json({ error: 'Database error' });
  }
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
// ===== เพิ่มตรวจสอบ OTP ก่อนสมัคร (register) =====
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, otp } = req.body;

  // ตรวจสอบ input
  if (!email || !password || !otp) {
    return res.status(400).json({ error: 'Email, password, and OTP are required' });
  }

  // ตรวจสอบ OTP (ก่อนตรวจสอบซ้ำซ้อนอีเมล)
  const otpResult = otpManager.verifyOtp(email, otp);
  if (!otpResult.valid) {
    return res.status(400).json({ error: otpResult.error || "OTP ไม่ถูกต้อง" });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, name]
    );
    const userId = result.rows[0].id;

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
        // แค่ log error เฉยๆ ไม่ block การสมัคร
        console.error('Failed to create default category:', err);
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
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

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

/* ====================== Categories Routes + ถังขยะหมวดหมู่ ======================== */

// app.get('/api/categories') รองรับ trashed
app.get('/api/categories', authenticateToken, async (req, res) => {
  const { trashed } = req.query;

  let query = 'SELECT id, name, sing as slug, deleted, deleted_at FROM categories WHERE user_id = $1';
  let params = [req.userId];

  if (trashed === '1') {
    query += ' AND deleted = TRUE';
  } else {
    query += ' AND (deleted = FALSE OR deleted IS NULL)';
  }

  query += ' ORDER BY name';

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
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
    const existing = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND sing = $2',
      [req.userId, slug]
    );
    if (existing.rows.length) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const result = await pool.query(
      'INSERT INTO categories (user_id, name, sing) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, name, slug]
    );

    res.json({
      id: result.rows[0].id,
      name: name,
      slug: slug,
      user_id: req.userId
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

// ย้ายหมวดหมู่ไปถังขยะ (Soft Delete)
app.patch('/api/categories/:slug/trash', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;

  try {
    const { rows } = await pool.query(
      'SELECT id, name, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2',
      [categorySlug, req.userId]
    );
    const category = rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const codesResult = await pool.query(
      'UPDATE codes SET deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND category = $2',
      [req.userId, category.sing]
    );
    const codesMoved = codesResult.rowCount;

    const updateCat = await pool.query(
      'UPDATE categories SET deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );

    res.json({
      message: 'Category and all related codes moved to trash',
      categoryMoved: updateCat.rowCount,
      codesMoved: codesMoved
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// กู้คืนหมวดหมู่จากถังขยะ
app.post('/api/categories/:slug/restore', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;

  try {
    const { rows } = await pool.query(
      'SELECT id, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2 AND deleted = TRUE',
      [categorySlug, req.userId]
    );
    const category = rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found in trash' });
    }

    const updateCat = await pool.query(
      'UPDATE categories SET deleted = FALSE, deleted_at = NULL WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );

    const codesResult = await pool.query(
      'UPDATE codes SET deleted = FALSE, deleted_at = NULL WHERE user_id = $1 AND category = $2',
      [req.userId, category.sing]
    );

    res.json({
      message: 'Category restored successfully',
      codesRestored: codesResult.rowCount
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// ลบหมวดหมู่ถาวร
app.delete('/api/categories/:slug/force-delete', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;

  try {
    const { rows } = await pool.query(
      'SELECT id, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2 AND deleted = TRUE',
      [categorySlug, req.userId]
    );
    const category = rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found in trash' });
    }

    const codesResult = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND category = $2 AND deleted = TRUE',
      [req.userId, category.sing]
    );
    const codesDeleted = codesResult.rowCount;
    const delCat = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );

    res.json({
      message: 'Category permanently deleted',
      categoryDeleted: delCat.rowCount,
      codesDeleted: codesDeleted
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// กู้คืนหมวดหมู่ทั้งหมดจากถังขยะ
app.post('/api/categories/restore-all', authenticateToken, async (req, res) => {
  try {
    const updateCats = await pool.query(
      'UPDATE categories SET deleted = FALSE, deleted_at = NULL WHERE user_id = $1 AND deleted = TRUE',
      [req.userId]
    );
    const categoriesRestored = updateCats.rowCount;
    const updateCodes = await pool.query(
      'UPDATE codes SET deleted = FALSE, deleted_at = NULL WHERE user_id = $1 AND deleted = TRUE',
      [req.userId]
    );

    res.json({
      message: 'All categories and codes restored',
      categoriesRestored,
      codesRestored: updateCodes.rowCount
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to restore all categories' });
  }
});

// ลบหมวดหมู่ทั้งหมดจากถังขยะถาวร
app.delete('/api/categories/force-delete-all', authenticateToken, async (req, res) => {
  try {
    const codesResult = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND deleted = TRUE',
      [req.userId]
    );
    const codesDeleted = codesResult.rowCount;
    const catsResult = await pool.query(
      'DELETE FROM categories WHERE user_id = $1 AND deleted = TRUE',
      [req.userId]
    );

    res.json({
      message: 'All trash permanently deleted',
      categoriesDeleted: catsResult.rowCount,
      codesDeleted: codesDeleted
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete all categories' });
  }
});

// ======= END หมวดหมู่ / ถังขยะหมวดหมู่ =======

// แก้ไข route ลบหมวดหมู่ให้ใช้ slug/name แทน id (แบบเดิม)
app.delete('/api/categories/:slug', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;

  try {
    const catFind = await pool.query(
      'SELECT id, name, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2',
      [categorySlug, req.userId]
    );
    const category = catFind.rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const codeFind = await pool.query(
      'SELECT id FROM codes WHERE user_id = $1 AND category = $2 AND (deleted = FALSE OR deleted IS NULL) LIMIT 1',
      [req.userId, category.sing]
    );
    const codeUsingCategory = codeFind.rows[0];

    if (codeUsingCategory) {
      await pool.query(
        'UPDATE codes SET deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND category = $2',
        [req.userId, category.sing]
      );
      const delCat = await pool.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2',
        [category.id, req.userId]
      );
      res.json({
        message: 'Category deleted successfully. All codes in this category have been moved to trash.',
        codesMovedToTrash: delCat.rowCount
      });
    } else {
      const delCat = await pool.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2',
        [category.id, req.userId]
      );
      res.json({
        message: 'Category deleted successfully',
        categoryDeleted: delCat.rowCount
      });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// หรือถ้าต้องการให้ลบแบบแข็งขัน (ลบ codes ที่เกี่ยวข้องไปด้วย)
app.delete('/api/categories/:slug/force', authenticateToken, async (req, res) => {
  const categorySlug = req.params.slug;

  try {
    const { rows } = await pool.query(
      'SELECT id, sing FROM categories WHERE (sing = $1 OR name = $1) AND user_id = $2',
      [categorySlug, req.userId]
    );
    const category = rows[0];
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const codesResult = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND category = $2',
      [req.userId, category.sing]
    );
    const codesDeleted = codesResult.rowCount;

    const delCat = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [category.id, req.userId]
    );

    res.json({
      message: 'Category and all related codes permanently deleted',
      categoryDeleted: delCat.rowCount,
      codesDeleted: codesDeleted
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// ===== ระบบถังขยะ API Routes =====

app.patch('/api/codes/:id/trash', authenticateToken, async (req, res) => {
  const codeId = req.params.id;

  try {
    const result = await pool.query(
      'UPDATE codes SET deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code moved to trash' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to trash code' });
  }
});

app.post('/api/codes/:id/restore', authenticateToken, async (req, res) => {
  const codeId = req.params.id;

  try {
    const result = await pool.query(
      'UPDATE codes SET deleted = FALSE, deleted_at = NULL WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code restored' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to restore code' });
  }
});

app.delete('/api/codes/:id/force-delete', authenticateToken, async (req, res) => {
  const codeId = req.params.id;

  try {
    const result = await pool.query(
      'DELETE FROM codes WHERE id = $1 AND user_id = $2 AND deleted = TRUE',
      [codeId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found in trash' });
    }
    res.json({ message: 'Code permanently deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete permanently' });
  }
});

app.post('/api/codes/restore-all', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE codes SET deleted = FALSE, deleted_at = NULL WHERE user_id = $1 AND deleted = TRUE',
      [req.userId]
    );
    res.json({ message: 'All codes restored', restored: result.rowCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to restore all' });
  }
});

app.delete('/api/codes/force-delete-all', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM codes WHERE user_id = $1 AND deleted = TRUE',
      [req.userId]
    );
    res.json({ message: 'All trash permanently deleted', deleted: result.rowCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete all permanently' });
  }
});

app.get('/api/codes', authenticateToken, async (req, res) => {
  const { category, search, trashed } = req.query;
  let query = 'SELECT * FROM codes WHERE user_id = $1';
  let params = [req.userId];
  let cnt = 2;

  if (trashed === '1') {
    query += ' AND deleted = TRUE';
  } else {
    query += ' AND (deleted = FALSE OR deleted IS NULL)';
  }

  if (category && category !== 'all') {
    query += ` AND category = $${cnt}`;
    params.push(category);
    cnt++;
  }

  if (search) {
    query += ` AND (name ILIKE $${cnt} OR code ILIKE $${cnt + 1} OR description ILIKE $${cnt + 2})`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
    cnt += 3;
  }

  query += ' ORDER BY created_at DESC';

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// --- แก้ไข app.post('/api/codes') และ app.put('/api/codes/:id') ให้ตรวจสอบ sing ---

app.post('/api/codes', authenticateToken, async (req, res) => {
  const { name, code, description, category, expires_at } = req.body;

  if (!name || !code || !category) {
    return res.status(400).json({ error: 'Name, code and category are required' });
  }

  try {
    const catResult = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND sing = $2',
      [req.userId, category]
    );
    if (!catResult.rows.length) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const insertResult = await pool.query(
      `INSERT INTO codes (user_id, name, code, description, category, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, name, code, description, category, expires_at]
    );

    res.json(insertResult.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create code' });
  }
});

// UPDATED PUT /api/codes/:id (ตรวจสอบ category ก่อนอัปเดต ใช้ sing)
app.put('/api/codes/:id', authenticateToken, async (req, res) => {
  const { name, code, description, expires_at, category } = req.body;
  const codeId = req.params.id;

  try {
    const catResult = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND sing = $2',
      [req.userId, category]
    );
    if (!catResult.rows.length) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const result = await pool.query(
      `UPDATE codes SET name = $1, code = $2, description = $3, expires_at = $4,
        category = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6 AND user_id = $7`,
      [name, code, description, expires_at, category, codeId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ message: 'Code updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update code' });
  }
});

app.delete('/api/codes/:id', authenticateToken, async (req, res) => {
  const codeId = req.params.id;

  try {
    const found = await pool.query(
      'SELECT id FROM codes WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (!found.rows.length) {
      return res.status(404).json({ error: 'Code not found' });
    }

    const result = await pool.query(
      'DELETE FROM codes WHERE id = $1 AND user_id = $2',
      [codeId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Code not found or already deleted' });
    }
    res.json({ message: 'Code deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete code' });
  }
});

// User profile route
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// === Forgot Password === (ต้องอยู่หลัง transporter สร้างแล้วเท่านั้น) [ปิดท้ายด้วย reset-route ของ email]
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const result = await pool.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "ไม่พบบัญชีนี้ในระบบ" });

    // สร้าง token สำหรับ reset (random)
    const resetToken = Math.random().toString(36).substring(2, 10);
    const expire = Date.now() + 1000 * 60 * 15; // 15 นาที

    if (!global.resetTokens) global.resetTokens = new Map();
    global.resetTokens.set(resetToken, { email, expire });

    // 🔥 เปลี่ยนลิงก์เป็น APP_URL
    const resetLink = `${process.env.APP_URL}/reset-password.htm?token=${resetToken}`;

    try {
      // 1. สร้าง email object
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

      // 2. ตั้งค่า
      sendSmtpEmail.sender = { email: MAIN_EMAIL, name: 'KeyVault Support' };
      sendSmtpEmail.to = [{ email: email }];
      sendSmtpEmail.subject = "🔐 Reset your KeyVault password";
      sendSmtpEmail.htmlContent = `
          <div style="font-family:Arial;padding:16px;max-width:500px;margin:0 auto;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1e293b;">Reset Your Password</h2>
            <p style="color:#475569;">คลิกลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่านของคุณ (ภายใน 15 นาที)</p>
            <a href="${resetLink}" style="display:inline-block;margin:15px 0;padding:12px 20px;background:#3b82f6;color:white;border-radius:6px;text-decoration:none;">Reset Password</a>
            <p style="font-size:12px;color:#64748b;">หากคุณไม่ได้ร้องขอการเปลี่ยนรหัสผ่าน โปรดละเว้นอีเมลนี้</p>
          </div>
        `;

      // 3. สั่งยิง API
      await brevoApi.sendTransacEmail(sendSmtpEmail);

      res.json({ success: true });
    } catch (err) {
      console.error("Email send failed:", err);
      res.status(500).json({ error: "ส่งอีเมลไม่สำเร็จ" });
    }
  } catch (err) {
    res.status(500).json({ error: "Database error" });
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
    await pool.query(
      "UPDATE users SET password = $1 WHERE email = $2",
      [hashed, data.email]
    );
    global.resetTokens.delete(token);
    res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
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
    // 1. สร้าง email object สำหรับ Brevo
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    // 2. ตั้งค่าผู้รับ ผู้ส่ง และเนื้อหา
    sendSmtpEmail.sender = { email: MAIN_EMAIL, name: 'KeyVault' };
    sendSmtpEmail.to = [{ email: email }];
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
      `; // (คัดลอก HTML เดิมของคุณมาทั้งหมด)

    // 3. สั่งยิง API
    await brevoApi.sendTransacEmail(sendSmtpEmail);

    res.json({
      success: true,
      message: "ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว",
      cooldown: 60
    });
  } catch (err) {
    otpManager.otpCooldown.delete(email);

    console.error("ส่งอีเมลล้มเหลว:", err);
    if (err && err.stack) {
      console.error('Stack trace:', err.stack);
    }
    res.status(500).json({ error: "ส่งอีเมลไม่สำเร็จ" });
  }
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

// Static & Rate Limiting
app.use(express.static(__dirname));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Handle 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'LoginIndex.htm'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Login page: http://localhost:${PORT}/`);
  console.log(`Main page: http://localhost:${PORT}/main`);
});