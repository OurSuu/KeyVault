const db = require('./database.js');

console.log('🔍 Checking database schema...');

// ตรวจสอบตาราง categories
db.all("PRAGMA table_info(categories)", (err, columns) => {
  if (err) {
    console.error('❌ Error checking categories table:', err);
    return;
  }
  
  console.log('\n📋 Categories table columns:');
  columns.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  
  // ตรวจสอบว่ามี column 'slug' หรือ 'sing'
  const hasSlug = columns.some(col => col.name === 'slug');
  const hasSing = columns.some(col => col.name === 'sing');
  
  console.log(`\nℹ️  Has 'slug' column: ${hasSlug}`);
  console.log(`ℹ️  Has 'sing' column: ${hasSing}`);
});

// ตรวจสอบตารางทั้งหมด
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('Error getting tables:', err);
    return;
  }
  
  console.log('\n📊 All tables in database:');
  tables.forEach(table => {
    console.log(`  - ${table.name}`);
  });
});

// ตรวจสอบข้อมูลใน categories
db.all("SELECT * FROM categories LIMIT 5", (err, rows) => {
  if (err) {
    console.error('Error reading categories:', err);
    return;
  }
  
  console.log('\n📝 Sample data from categories:');
  console.log(rows);
});