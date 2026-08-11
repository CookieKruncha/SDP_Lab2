"use server";

import { getDb } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Task {
  id: number;
  title: string;
  description: string;
  due_date: string | null;
  topic: string;
  status: "Todo" | "InProgress" | "Complete";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  priority: number;
  effort: number;
  is_overdue: boolean;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface ActivityEntry {
  id: number;
  task_id: number | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  task_title?: string;
}

export interface SavedView {
  id: number;
  name: string;
  filter_json: string;
  sort_by: string;
  view_type: string;
  created_at: string;
}

export type SortBy = "due_date" | "topic" | "status" | "priority";

// ─── Activity Log (append-only, never edited or deleted) ──────────────────────

function logActivity(
  db: ReturnType<typeof getDb>,
  taskId: number | null,
  action: string,
  field?: string | null,
  oldValue?: string | null,
  newValue?: string | null
) {
  db.prepare(
    `INSERT INTO activity_log (task_id, action, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?)`
  ).run(taskId, action, field ?? null, oldValue ?? null, newValue ?? null);
}

// ─── Create Task ──────────────────────────────────────────────────────────────

export async function createTask(data: {
  title: string;
  description?: string;
  due_date?: string;
  topic?: string;
  priority?: number;
  effort?: number;
}): Promise<Task> {
  const db = getDb();
  const { title, description = "", due_date = null, topic = "", priority = 2, effort = 0 } = data;

  const result = db
    .prepare(
      `INSERT INTO tasks (title, description, due_date, topic, priority, effort)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title, description, due_date, topic, priority, effort);

  const id = result.lastInsertRowid as number;
  logActivity(db, id, "created", null, null, title);

  return (await getTask(id))!;
}

// ─── Update Task ──────────────────────────────────────────────────────────────

export async function updateTask(
  id: number,
  fields: Partial<Pick<Task, "title" | "description" | "due_date" | "topic" | "status" | "priority" | "effort">>
): Promise<Task> {
  const db = getDb();
  const existing = getTaskRaw(id);
  if (!existing) throw new Error(`Task ${id} not found`);

  // Status must be one of the three fixed values
  if (fields.status && !["Todo", "InProgress", "Complete"].includes(fields.status)) {
    throw new Error("Invalid status. Only Todo, InProgress, Complete are allowed.");
  }

  const sets: string[] = [];
  const values: any[] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);

      // Log each field change in same transaction
      const oldVal = (existing as any)[key];
      const newVal = val;
      if (String(oldVal) !== String(newVal)) {
        logActivity(db, id, "updated", key, String(oldVal ?? ""), String(newVal ?? ""));
      }
    }
  }

  if (sets.length === 0) return (await getTask(id))!;

  sets.push(`updated_at = datetime('now')`);
  values.push(id);

  db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  return (await getTask(id))!;
}

// ─── Archive Task (never delete — sets archived_at timestamp) ─────────────────

export async function archiveTask(id: number): Promise<Task> {
  const db = getDb();
  const existing = getTaskRaw(id);
  if (!existing) throw new Error(`Task ${id} not found`);

  db.prepare(
    `UPDATE tasks SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(id);

  logActivity(db, id, "archived", "archived_at", null, new Date().toISOString());

  return (await getTask(id))!;
}

// ─── Unarchive Task ───────────────────────────────────────────────────────────

export async function unarchiveTask(id: number): Promise<Task> {
  const db = getDb();
  db.prepare(
    `UPDATE tasks SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(id);

  logActivity(db, id, "unarchived", "archived_at", "archived", null);

  return (await getTask(id))!;
}

// ─── List Tasks ───────────────────────────────────────────────────────────────
// Overdue is DERIVED from due_date and status — never stored as a column.

export async function listTasks(opts: {
  sortBy?: SortBy;
  includeArchived?: boolean;
  topicFilter?: string;
  statusFilter?: string;
  tagIds?: number[];
  searchQuery?: string;
} = {}): Promise<Task[]> {
  const {
    sortBy = "due_date",
    includeArchived = false,
    topicFilter,
    statusFilter,
    tagIds,
    searchQuery,
  } = opts;

  const db = getDb();

  const orderClause = {
    due_date: "ORDER BY t.due_date IS NULL, t.due_date ASC, t.priority ASC",
    topic: "ORDER BY t.topic ASC, t.due_date IS NULL, t.due_date ASC",
    status: `ORDER BY CASE t.status WHEN 'Todo' THEN 0 WHEN 'InProgress' THEN 1 WHEN 'Complete' THEN 2 END, t.due_date IS NULL, t.due_date ASC`,
    priority: "ORDER BY t.priority ASC, t.due_date IS NULL, t.due_date ASC",
  }[sortBy];

  let query = `
    SELECT t.*,
      CASE
        WHEN t.due_date IS NOT NULL
             AND t.due_date < date('now')
             AND t.status != 'Complete'
             AND t.archived_at IS NULL
        THEN 1 ELSE 0
      END AS is_overdue
    FROM tasks t
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (!includeArchived) {
    conditions.push("t.archived_at IS NULL");
  }

  if (topicFilter) {
    conditions.push("t.topic = ?");
    params.push(topicFilter);
  }

  if (statusFilter) {
    conditions.push("t.status = ?");
    params.push(statusFilter);
  }

  if (tagIds && tagIds.length > 0) {
    // Intersection: task must have ALL selected tags
    for (const tagId of tagIds) {
      conditions.push(`EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)`);
      params.push(tagId);
    }
  }

  if (searchQuery) {
    conditions.push(`t.id IN (SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH ?)`);
    params.push(searchQuery);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " " + orderClause;

  return db.prepare(query).all(...params) as Task[];
}

// ─── Get Single Task ──────────────────────────────────────────────────────────

export async function getTask(id: number): Promise<Task | null> {
  const db = getDb();
  return (
    (db
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
      .get(id) as Task) ?? null
  );
}

function getTaskRaw(id: number): any {
  const db = getDb();
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function createTag(name: string, color: string = "#6366f1"): Promise<Tag> {
  const db = getDb();
  const result = db.prepare("INSERT INTO tags (name, color) VALUES (?, ?)").run(name, color);
  return { id: result.lastInsertRowid as number, name, color };
}

export async function renameTag(id: number, newName: string): Promise<Tag> {
  const db = getDb();
  db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(newName, id);
  return db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as Tag;
}

export async function colorTag(id: number, color: string): Promise<Tag> {
  const db = getDb();
  db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(color, id);
  return db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as Tag;
}

export async function deleteTag(id: number): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}

export async function listTags(): Promise<Tag[]> {
  const db = getDb();
  return db.prepare("SELECT * FROM tags ORDER BY name ASC").all() as Tag[];
}

export async function addTagToTask(taskId: number, tagId: number): Promise<void> {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskId, tagId);
}

export async function removeTagFromTask(taskId: number, tagId: number): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?").run(taskId, tagId);
}

export async function getTaskTags(taskId: number): Promise<Tag[]> {
  const db = getDb();
  return db
    .prepare("SELECT t.* FROM tags t INNER JOIN task_tags tt ON t.id = tt.tag_id WHERE tt.task_id = ?")
    .all(taskId) as Tag[];
}

// ─── Activity Log Queries ─────────────────────────────────────────────────────

export async function getActivityFeed(limit: number = 50): Promise<ActivityEntry[]> {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.*, t.title as task_title
       FROM activity_log a
       LEFT JOIN tasks t ON a.task_id = t.id
       ORDER BY a.created_at DESC
       LIMIT ?`
    )
    .all(limit) as ActivityEntry[];
}

export async function getTaskHistory(taskId: number): Promise<ActivityEntry[]> {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at ASC`
    )
    .all(taskId) as ActivityEntry[];
}

// ─── Undo / Redo (reconstructed from activity_log, not in-memory) ─────────────

export async function undoLastAction(): Promise<boolean> {
  const db = getDb();
  const last = db
    .prepare(
      `SELECT * FROM activity_log WHERE action NOT LIKE 'undo_%' ORDER BY id DESC LIMIT 1`
    )
    .get() as ActivityEntry | undefined;

  if (!last) return false;

  const txn = db.transaction(() => {
    if (last.action === "created") {
      // Undo create = archive the task
      db.prepare(
        `UPDATE tasks SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).run(last.task_id);
      logActivity(db, last.task_id, "undo_created", null, null, null);
    } else if (last.action === "updated" && last.field) {
      // Undo field update = restore old value
      db.prepare(
        `UPDATE tasks SET ${last.field} = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(last.old_value ?? "", last.task_id);
      logActivity(db, last.task_id, "undo_updated", last.field, last.new_value, last.old_value);
    } else if (last.action === "archived") {
      // Undo archive = unarchive
      db.prepare(
        `UPDATE tasks SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(last.task_id);
      logActivity(db, last.task_id, "undo_archived", null, null, null);
    } else if (last.action === "unarchived") {
      // Undo unarchive = re-archive
      db.prepare(
        `UPDATE tasks SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).run(last.task_id);
      logActivity(db, last.task_id, "undo_unarchived", null, null, null);
    }
  });

  txn();
  return true;
}

// ─── Saved Views ──────────────────────────────────────────────────────────────

export async function createSavedView(view: Omit<SavedView, "id" | "created_at">): Promise<SavedView> {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO saved_views (name, filter_json, sort_by, view_type) VALUES (?, ?, ?, ?)")
    .run(view.name, view.filter_json, view.sort_by, view.view_type);
  return db.prepare("SELECT * FROM saved_views WHERE id = ?").get(result.lastInsertRowid) as SavedView;
}

export async function listSavedViews(): Promise<SavedView[]> {
  const db = getDb();
  return db.prepare("SELECT * FROM saved_views ORDER BY name ASC").all() as SavedView[];
}

export async function deleteSavedView(id: number): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM saved_views WHERE id = ?").run(id);
}

// ─── Settings (persisted in SQLite, not browser storage) ──────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(
    key,
    value,
    value
  );
}

// ─── Today View Query ─────────────────────────────────────────────────────────

export async function getTodayTasks(): Promise<Task[]> {
  const db = getDb();
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
      FROM tasks t
      WHERE t.archived_at IS NULL
        AND (
          (t.due_date IS NOT NULL AND t.due_date < date('now') AND t.status != 'Complete')
          OR t.due_date = date('now')
          OR t.status = 'InProgress'
        )
      ORDER BY
        CASE
          WHEN t.due_date IS NOT NULL AND t.due_date < date('now') AND t.status != 'Complete' THEN 0
          WHEN t.due_date = date('now') THEN 1
          WHEN t.status = 'InProgress' THEN 2
        END,
        t.priority ASC,
        t.due_date ASC`
    )
    .all() as Task[];
}

// ─── FTS5 Search ──────────────────────────────────────────────────────────────

export async function searchTasks(query: string): Promise<(Task & { snippet: string })[]> {
  const db = getDb();
  if (!query.trim()) return [];

  // Escape special FTS5 chars and add prefix matching
  const safeQuery = query.replace(/['"]/g, "").trim();
  if (!safeQuery) return [];

  try {
    return db
      .prepare(
        `SELECT t.*,
          CASE
            WHEN t.due_date IS NOT NULL
                 AND t.due_date < date('now')
                 AND t.status != 'Complete'
                 AND t.archived_at IS NULL
            THEN 1 ELSE 0
          END AS is_overdue,
          snippet(tasks_fts, 0, '<mark>', '</mark>', '...', 20) AS snippet
        FROM tasks_fts fts
        JOIN tasks t ON t.id = fts.rowid
        WHERE tasks_fts MATCH ?
        AND t.archived_at IS NULL
        ORDER BY rank`
      )
      .all(safeQuery) as (Task & { snippet: string })[];
  } catch {
    // If FTS query is malformed, return empty
    return [];
  }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getStats() {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE archived_at IS NULL").get() as any).c;
  const completed = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'Complete' AND archived_at IS NULL").get() as any).c;
  const overdue = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date < date('now') AND status != 'Complete' AND archived_at IS NULL").get() as any).c;
  const inProgress = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'InProgress' AND archived_at IS NULL").get() as any).c;

  const byTopic = db.prepare(`
    SELECT topic, COUNT(*) as count,
      SUM(CASE WHEN status = 'Complete' THEN 1 ELSE 0 END) as completed
    FROM tasks WHERE archived_at IS NULL AND topic != ''
    GROUP BY topic ORDER BY count DESC
  `).all();

  const recentActivity = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM activity_log
    WHERE created_at >= date('now', '-30 days')
    GROUP BY DATE(created_at) ORDER BY day ASC
  `).all();

  return { total, completed, overdue, inProgress, byTopic, recentActivity };
}
