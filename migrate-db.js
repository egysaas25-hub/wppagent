const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db'); // Adjust path if different
const db = new Database(dbPath);

try {
  // Add missing column if it doesn't exist
  db.exec(`
    PRAGMA foreign_keys = ON;
    
    -- Add auto_reconnect column if missing
    ALTER TABLE sessions ADD COLUMN auto_reconnect INTEGER DEFAULT 1;
    
    console.log('‚úÖ Migration completed: auto_reconnect column added');
  `);
  
  // Check table structure
  const columns = db.prepare(`
    SELECT sql FROM pragma_table_info('sessions')
  `).all();
  
  console.log('Ì≥ã Current sessions table columns:');
  columns.forEach(col => console.log(`  - ${col.name}`));
  
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('‚ÑπÔ∏è Column already exists, no migration needed');
  } else {
    console.error('‚ùå Migration failed:', error.message);
  }
} finally {
  db.close();
}
