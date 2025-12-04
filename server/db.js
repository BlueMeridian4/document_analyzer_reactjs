import Database from "better-sqlite3";

const db = new Database("database.sqlite");

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    timestamp TEXT,
    status TEXT,
    summary TEXT,
    topics TEXT,
    docType TEXT,
    tokens TEXT
  );
`);

// ------ MIGRATION: Add "error" column if missing ------
const pragma = db.prepare(`PRAGMA table_info(documents)`).all();
const columnNames = pragma.map(col => col.name);

if (!columnNames.includes("error")) {
  db.exec(`ALTER TABLE documents ADD COLUMN error TEXT`);
  console.log("Added missing column: error");
}

// ------ CLEANUP: Mark abandoned tasks as Error ------
db.exec(`
  UPDATE documents
  SET status = 'Error', error = 'Unfinished processing task (server restart or crash)'
  WHERE status = 'Processing';
`);

// OPTIONAL: keep only latest 100
db.exec(`
  DELETE FROM documents
  WHERE id NOT IN (SELECT id FROM documents ORDER BY id DESC LIMIT 100);
`);

// ---------- Helper Methods ----------
export function insertDocument(doc) {
  const stmt = db.prepare(`
    INSERT INTO documents (name, timestamp, status)
    VALUES (?, ?, ?)
  `);
  return stmt.run(doc.name, doc.timestamp, doc.status).lastInsertRowid;
}

export function updateDocument(id, fields) {
  const stmt = db.prepare(`
    UPDATE documents
    SET
      status = ?,
      summary = ?,
      topics = ?,
      docType = ?,
      tokens = ?,
      error = ?
    WHERE id = ?
  `);

  stmt.run(
    fields.status,
    fields.summary ?? null,
    JSON.stringify(fields.topics ?? null),
    fields.docType ?? null,
    JSON.stringify(fields.tokens ?? null),
    fields.error ?? null,
    id
  );
}

export function getLatestDocumentByName(name) {
  return db.prepare(`
    SELECT *
    FROM documents
    WHERE name = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(name);
}

export function getAllDocuments() {
  const stmt = db.prepare(`SELECT * FROM documents`);
  const docs = stmt.all();

  return docs.map(d => ({
    ...d,
    topics: d.topics ? JSON.parse(d.topics) : [],
    tokens: d.tokens ? JSON.parse(d.tokens) : null
  }));
}

export default db;
