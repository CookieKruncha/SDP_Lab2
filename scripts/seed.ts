import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "todo.db");

// ─── Realistic seed data ──────────────────────────────────────────────────────

const topics = [
  "COMS3011A", "COMS3009A", "MATH2011", "Personal", "Work",
  "Research", "Side Project", "Health", "Finance", "Reading",
];

const adjectives = [
  "Review", "Draft", "Finalize", "Prepare", "Submit",
  "Research", "Implement", "Design", "Test", "Update",
  "Refactor", "Debug", "Document", "Deploy", "Optimize",
  "Plan", "Schedule", "Organize", "Complete", "Analyze",
];

const nouns = [
  "report", "presentation", "assignment", "project proposal",
  "lab submission", "literature review", "algorithm implementation",
  "database schema", "API endpoint", "unit tests",
  "user interface", "performance analysis", "code review",
  "documentation", "meeting notes", "study guide",
  "exam preparation", "research paper", "design document", "budget plan",
];

const descriptions = [
  "Need to focus on the edge cases and error handling.",
  "Check the rubric before submitting.",
  "Discuss with the team before finalizing.",
  "Reference the lecture slides for this topic.",
  "Make sure to include diagrams and examples.",
  "Follow the formatting guidelines carefully.",
  "Add proper citations and references.",
  "Include test cases for all major functions.",
  "Make sure this builds on the previous work.",
  "Consider performance implications at scale.",
  "Review the feedback from the last iteration.",
  "Cross-reference with the project requirements.",
  "",  // Many tasks have no description
  "",
  "",
];

const tagNames = [
  { name: "urgent", color: "#ef4444" },
  { name: "important", color: "#f59e0b" },
  { name: "blocked", color: "#6b7280" },
  { name: "review", color: "#8b5cf6" },
  { name: "research", color: "#06b6d4" },
  { name: "coding", color: "#3b82f6" },
  { name: "writing", color: "#ec4899" },
  { name: "reading", color: "#14b8a6" },
];

function randomDate(startOffset: number, endOffset: number): string {
  const now = new Date();
  const start = new Date(now.getTime() + startOffset * 86400000);
  const end = new Date(now.getTime() + endOffset * 86400000);
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split("T")[0];
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTitle(): string {
  return `${randomItem(adjectives)} ${randomItem(nouns)}`;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

function seed() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations (import would be circular, so inline minimal schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((r: any) => r.name)
  );

  const migrations: [string, string][] = [
    ["001_initial", `
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
    `],
    ["002_priority_effort", `
      ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 0 AND 3);
      ALTER TABLE tasks ADD COLUMN effort INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    `],
    ["003_tags", `
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
    `],
    ["004_activity_log", `
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
    `],
    ["005_saved_views", `
      CREATE TABLE IF NOT EXISTS saved_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filter_json TEXT NOT NULL DEFAULT '{}',
        sort_by TEXT NOT NULL DEFAULT 'due_date',
        view_type TEXT NOT NULL DEFAULT 'list',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `],
    ["006_fts5", `
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
    `],
    ["007_settings", `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `],
  ];

  const insertMigration = db.prepare("INSERT INTO schema_migrations (name) VALUES (?)");
  for (const [name, sql] of migrations) {
    if (!applied.has(name)) {
      try {
        db.exec(sql);
        insertMigration.run(name);
      } catch (e: any) {
        if (e.message?.includes("duplicate column")) insertMigration.run(name);
        else throw e;
      }
    }
  }

  // Clear existing data for clean seed
  db.exec("DELETE FROM task_tags");
  db.exec("DELETE FROM tags");
  db.exec("DELETE FROM tasks");
  db.exec("DELETE FROM activity_log");

  // Insert tags
  const insertTag = db.prepare("INSERT INTO tags (name, color) VALUES (?, ?)");
  const tagIds: number[] = [];
  for (const tag of tagNames) {
    const result = insertTag.run(tag.name, tag.color);
    tagIds.push(result.lastInsertRowid as number);
  }

  // Insert tasks
  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, due_date, topic, status, priority, effort, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertTaskTag = db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)");
  const insertActivity = db.prepare(
    "INSERT INTO activity_log (task_id, action, field, old_value, new_value) VALUES (?, 'created', NULL, NULL, ?)"
  );

  const statuses = ["Todo", "Todo", "Todo", "InProgress", "Complete"]; // Weighted towards Todo

  const seedTxn = db.transaction(() => {
    const taskCount = 500;
    for (let i = 0; i < taskCount; i++) {
      const title = generateTitle();
      const desc = randomItem(descriptions);
      const topic = randomItem(topics);
      const status = randomItem(statuses);
      const priority = Math.floor(Math.random() * 4);
      const effort = [0, 0, 0, 1, 2, 3, 4, 8][Math.floor(Math.random() * 8)];

      // Spread dates: 30% past (overdue candidates), 40% near future, 30% far future
      let dueDate: string | null;
      const roll = Math.random();
      if (roll < 0.3) {
        dueDate = randomDate(-30, -1); // Past
      } else if (roll < 0.7) {
        dueDate = randomDate(0, 14); // Next 2 weeks
      } else {
        dueDate = randomDate(14, 90); // 2 weeks to 3 months
      }

      // Some tasks have no due date
      if (Math.random() < 0.1) dueDate = null;

      // 10% are archived
      const archived = Math.random() < 0.1 ? new Date().toISOString() : null;

      const result = insertTask.run(title, desc, dueDate, topic, status, priority, effort, archived);
      const taskId = result.lastInsertRowid as number;

      insertActivity.run(taskId, title);

      // Assign 0-3 tags per task
      const numTags = Math.floor(Math.random() * 4);
      const usedTags = new Set<number>();
      for (let j = 0; j < numTags; j++) {
        const tagId = randomItem(tagIds);
        if (!usedTags.has(tagId)) {
          usedTags.add(tagId);
          insertTaskTag.run(taskId, tagId);
        }
      }
    }
  });

  seedTxn();

  console.log(`Seeded ${500} tasks, ${tagNames.length} tags into ${DB_PATH}`);
  db.close();
}

seed();
