import fs from 'fs';

const content = fs.readFileSync('./supabase_schema.sql', 'utf8');
const lines = content.split('\n');

let lastDrop = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('DROP POLICY IF EXISTS')) {
    lastDrop = line.match(/"([^"]+)"/)[1];
  } else if (line.startsWith('CREATE POLICY')) {
    const createName = line.match(/"([^"]+)"/)[1];
    if (lastDrop !== createName) {
      console.log(`Missing DROP for policy "${createName}" at line ${i + 1}`);
    }
    lastDrop = null;
  }
}
