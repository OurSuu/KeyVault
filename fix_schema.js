const db = require('./database.js');

function fixSchema() {
  console.log('🔄 Fixing database schema...');

  // ตรวจสอบก่อนว่าตาราง categories มี column อะไรบ้าง
  db.all("PRAGMA table_info(categories)", (err, columns) => {
    if (err) {
      console.error('Error checking schema:', err);
      return;
    }

    const hasSlug = columns.some(col => col.name === 'slug');
    const hasSing = columns.some(col => col.name === 'sing');

    if (hasSing && !hasSlug) {
      console.log('⚠️  Found "sing" column, renaming to "slug"...');
      
      // เปลี่ยนชื่อ column จาก sing เป็น slug
      db.serialize(() => {
        // สร้างตารางชั่วคราว
        db.run(`CREATE TABLE categories_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // คัดลอกข้อมูล
        db.run(`INSERT INTO categories_temp (id, user_id, name, slug, created_at)
                SELECT id, user_id, name, sing, created_at FROM categories`);

        // ลบตารางเก่า
        db.run('DROP TABLE categories');

        // เปลี่ยนชื่อตารางชั่วคราว
        db.run('ALTER TABLE categories_temp RENAME TO categories');

        console.log('✅ Successfully renamed "sing" to "slug"');
        
        // ตรวจสอบอีกครั้ง
        checkSchema();
      });
    } else if (hasSlug) {
      console.log('✅ "slug" column already exists, no changes needed');
    } else {
      console.log('❌ Neither "slug" nor "sing" column found');
    }
  });
}

function checkSchema() {
  db.all("PRAGMA table_info(categories)", (err, columns) => {
    if (err) return;
    
    console.log('\n📋 Updated categories schema:');
    columns.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });
  });
}

// รันการแก้ไข
fixSchema();