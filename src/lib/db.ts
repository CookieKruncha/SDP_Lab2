import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "todo.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
  }
  return db;
}

export function getDbAtPath(dbPath: string): Database.Database {
  const d = new Database(dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  runMigrations(d);
  return d;
}

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    database
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((r: any) => r.name as string)
  );

  const migrations: [string, string][] = [
    [
      "001_initial",
      `
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        due_date TEXT,
        topic TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Todo' CHECK(status IN ('Todo','InProgress','Complete')),
        archived_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_topic ON tasks(topic);
      CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived_at);
    `,
    ],
    [
      "002_priority_effort",
      `
      ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 0 AND 3);
      ALTER TABLE tasks ADD COLUMN effort INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    `,
    ],
    [
      "003_tags",
      `
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#6366f1',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS task_tags (
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);
    `,
    ],
    [
      "004_activity_log",
      `
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        action TEXT NOT NULL,
        field TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_activity_task ON activity_log(task_id);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
    `,
    ],
    [
      "005_saved_views",
      `
      CREATE TABLE IF NOT EXISTS saved_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filter_json TEXT NOT NULL DEFAULT '{}',
        sort_by TEXT NOT NULL DEFAULT 'due_date',
        view_type TEXT NOT NULL DEFAULT 'list',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
    ],
    [
      "006_fts5",
      `
      CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
        title, description, content=tasks, content_rowid=id
      );
      CREATE TRIGGER IF NOT EXISTS tasks_fts_ai AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
      END;
      CREATE TRIGGER IF NOT EXISTS tasks_fts_ad AFTER DELETE ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
      END;
      CREATE TRIGGER IF NOT EXISTS tasks_fts_au AFTER UPDATE ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
        INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
      END;
    `,
    ],
    [
      "007_settings",
      `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
    ],
  ];

  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations (name) VALUES (?)"
  );

  for (const [name, sql] of migrations) {
    if (!applied.has(name)) {
      try {
        database.exec(sql);
        insertMigration.run(name);
      } catch (e: any) {
        // Column already exists (for ALTER TABLE ADD COLUMN)
        if (e.message?.includes("duplicate column")) {
          insertMigration.run(name);
        } else {
          throw e;
        }
      }
    }
  }
}
