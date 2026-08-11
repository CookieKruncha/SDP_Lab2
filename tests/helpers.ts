import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Creates a throwaway SQLite database with the full schema applied.
 * Each test gets its own isolated database — no dependency on working data.
 */
export function createTestDb(): { db: Database.Database; dbPath: string; cleanup: () => void } {
  const dbPath = path.join(os.tmpdir(), `todo-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Apply all migrations inline
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_date TEXT,
      topic TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Todo' CHECK(status IN ('Todo','InProgress','Complete')),
      archived_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 0 AND 3),
      effort INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_topic ON tasks(topic);
    CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

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

    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filter_json TEXT NOT NULL DEFAULT '{}',
      sort_by TEXT NOT NULL DEFAULT 'due_date',
      view_type TEXT NOT NULL DEFAULT 'list',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO schema_migrations (name) VALUES
      ('001_initial'), ('002_priority_effort'), ('003_tags'),
      ('004_activity_log'), ('005_saved_views'), ('007_settings');
  `);

  const cleanup = () => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(dbPath + "-wal");
      fs.unlinkSync(dbPath + "-shm");
    } catch {}
  };

  return { db, dbPath, cleanup };
}

// ─── Helpers that operate on a given db instance (not the global singleton) ───

export function createTaskInDb(db: Database.Database, data: {
  title: string;
  description?: string;
  due_date?: string;
  topic?: string;
  priority?: number;
  effort?: number;
  status?: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO tasks (title, description, due_date, topic, priority, effort, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.title,
      data.description ?? "",
      data.due_date ?? null,
      data.topic ?? "",
      data.priority ?? 2,
      data.effort ?? 0,
      data.status ?? "Todo"
    );
  return result.lastInsertRowid as number;
}

export function getTaskFromDb(db: Database.Database, id: number): any {
  return db
    .prepare(
      `SELECT t.*,
        CASE
          WHEN t.due_date IS NOT NULL
               AND t.due_date < date('now')
               AND t.status != 'Complete'
               AND t.archived_at IS NULL
          THEN 1 ELSE 0
        END AS is_overdue
      FROM tasks t WHERE t.id = ?`
    )
    .get(id);
}
