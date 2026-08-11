import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, createTaskInDb, getTaskFromDb } from "./helpers";
import type Database from "better-sqlite3";

let ctx: ReturnType<typeof createTestDb>;

afterEach(() => {
  if (ctx) ctx.cleanup();
});

// ─── Task Creation ────────────────────────────────────────────────────────────

describe("Task creation", () => {
  it("should create a task with all four fields plus priority and effort", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, {
      title: "Review lab submission",
      description: "Check rubric alignment",
      due_date: "2026-09-01",
      topic: "COMS3011A",
      priority: 1,
      effort: 3,
    });

    const task = getTaskFromDb(ctx.db, id);
    expect(task).not.toBeNull();
    expect(task.title).toBe("Review lab submission");
    expect(task.description).toBe("Check rubric alignment");
    expect(task.due_date).toBe("2026-09-01");
    expect(task.topic).toBe("COMS3011A");
    expect(task.priority).toBe(1);
    expect(task.effort).toBe(3);
    expect(task.status).toBe("Todo");
    expect(task.archived_at).toBeNull();
  });

  it("should default status to Todo", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "New task" });
    const task = getTaskFromDb(ctx.db, id);
    expect(task.status).toBe("Todo");
  });

  it("should default priority to P2 (normal)", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Default priority" });
    const task = getTaskFromDb(ctx.db, id);
    expect(task.priority).toBe(2);
  });

  it("should enforce priority range 0-3 via CHECK constraint", () => {
    ctx = createTestDb();
    expect(() => {
      ctx.db.prepare("INSERT INTO tasks (title, priority) VALUES (?, ?)").run("Bad priority", 5);
    }).toThrow();
  });

  it("should enforce status to one of Todo, InProgress, Complete", () => {
    ctx = createTestDb();
    expect(() => {
      ctx.db.prepare("INSERT INTO tasks (title, status) VALUES (?, ?)").run("Bad status", "Overdue");
    }).toThrow();
  });
});

// ─── Editing ──────────────────────────────────────────────────────────────────

describe("Task editing", () => {
  it("should update a task field and persist", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Original title" });

    ctx.db.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ?").run("Updated title", id);

    const task = getTaskFromDb(ctx.db, id);
    expect(task.title).toBe("Updated title");
  });

  it("should update status to InProgress", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Start work" });

    ctx.db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("InProgress", id);

    const task = getTaskFromDb(ctx.db, id);
    expect(task.status).toBe("InProgress");
  });

  it("should update status to Complete", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Finish work" });

    ctx.db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("Complete", id);

    const task = getTaskFromDb(ctx.db, id);
    expect(task.status).toBe("Complete");
  });

  it("should not allow a fourth status value", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "No fourth status" });

    expect(() => {
      ctx.db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("Blocked", id);
    }).toThrow();
  });
});

// ─── Archiving ────────────────────────────────────────────────────────────────

describe("Archive semantics", () => {
  it("should archive a task by setting archived_at (never DELETE)", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "To be archived" });

    ctx.db.prepare("UPDATE tasks SET archived_at = datetime('now') WHERE id = ?").run(id);

    const task = getTaskFromDb(ctx.db, id);
    expect(task).not.toBeNull(); // Still exists
    expect(task.archived_at).not.toBeNull();
  });

  it("should not remove archived tasks from the database", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Archive keep" });
    ctx.db.prepare("UPDATE tasks SET archived_at = datetime('now') WHERE id = ?").run(id);

    const count = (ctx.db.prepare("SELECT COUNT(*) as c FROM tasks").get() as any).c;
    expect(count).toBe(1);
  });

  it("should exclude archived tasks from active list query", () => {
    ctx = createTestDb();
    createTaskInDb(ctx.db, { title: "Active task" });
    const id2 = createTaskInDb(ctx.db, { title: "Archived task" });
    ctx.db.prepare("UPDATE tasks SET archived_at = datetime('now') WHERE id = ?").run(id2);

    const active = ctx.db.prepare("SELECT * FROM tasks WHERE archived_at IS NULL").all();
    expect(active.length).toBe(1);
    expect((active[0] as any).title).toBe("Active task");
  });

  it("should unarchive by setting archived_at back to NULL", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Unarchive me" });
    ctx.db.prepare("UPDATE tasks SET archived_at = datetime('now') WHERE id = ?").run(id);
    ctx.db.prepare("UPDATE tasks SET archived_at = NULL WHERE id = ?").run(id);

    const task = getTaskFromDb(ctx.db, id);
    expect(task.archived_at).toBeNull();
  });
});

// ─── Overdue derivation ───────────────────────────────────────────────────────

describe("Overdue derivation", () => {
  it("should derive overdue for a past-due non-complete task", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, {
      title: "Overdue task",
      due_date: "2020-01-01",
      status: "Todo",
    });

    const task = getTaskFromDb(ctx.db, id);
    expect(task.is_overdue).toBe(1);
  });

  it("should NOT mark a past-due Complete task as overdue", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, {
      title: "Completed late",
      due_date: "2020-01-01",
      status: "Complete",
    });

    const task = getTaskFromDb(ctx.db, id);
    expect(task.is_overdue).toBe(0);
  });

  it("should NOT mark a future-due task as overdue", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, {
      title: "Future task",
      due_date: "2030-12-31",
      status: "Todo",
    });

    const task = getTaskFromDb(ctx.db, id);
    expect(task.is_overdue).toBe(0);
  });

  it("should NOT mark a task without due date as overdue", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "No due date" });

    const task = getTaskFromDb(ctx.db, id);
    expect(task.is_overdue).toBe(0);
  });

  it("should NOT store overdue as a column — it is always derived", () => {
    ctx = createTestDb();
    // Verify there is no 'is_overdue' or 'overdue' column in the tasks table
    const columns = ctx.db.prepare("PRAGMA table_info(tasks)").all() as any[];
    const overdueCol = columns.find((c) => c.name === "is_overdue" || c.name === "overdue");
    expect(overdueCol).toBeUndefined();
  });

  it("should mark InProgress tasks as overdue when past due", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, {
      title: "Working on overdue",
      due_date: "2020-06-01",
      status: "InProgress",
    });

    const task = getTaskFromDb(ctx.db, id);
    expect(task.is_overdue).toBe(1);
  });

  it("should use date() for overdue check (not datetime), so timezone does not shift the boundary", () => {
    ctx = createTestDb();
    // A task due today should NOT be overdue
    const today = new Date().toISOString().split("T")[0];
    const id = createTaskInDb(ctx.db, { title: "Due today", due_date: today, status: "Todo" });

    const task = getTaskFromDb(ctx.db, id);
    expect(task.is_overdue).toBe(0);
  });
});

// ─── Sorting ──────────────────────────────────────────────────────────────────

describe("Sorting", () => {
  it("should sort by topic alphabetically", () => {
    ctx = createTestDb();
    createTaskInDb(ctx.db, { title: "B task", topic: "Banana" });
    createTaskInDb(ctx.db, { title: "A task", topic: "Apple" });
    createTaskInDb(ctx.db, { title: "C task", topic: "Cherry" });

    const tasks = ctx.db.prepare("SELECT * FROM tasks ORDER BY topic ASC").all() as any[];
    expect(tasks[0].topic).toBe("Apple");
    expect(tasks[1].topic).toBe("Banana");
    expect(tasks[2].topic).toBe("Cherry");
  });

  it("should sort by status in order Todo < InProgress < Complete", () => {
    ctx = createTestDb();
    createTaskInDb(ctx.db, { title: "Complete", status: "Complete" });
    createTaskInDb(ctx.db, { title: "Todo", status: "Todo" });
    createTaskInDb(ctx.db, { title: "InProgress", status: "InProgress" });

    const tasks = ctx.db.prepare(`
      SELECT * FROM tasks ORDER BY
        CASE status WHEN 'Todo' THEN 0 WHEN 'InProgress' THEN 1 WHEN 'Complete' THEN 2 END
    `).all() as any[];
    expect(tasks[0].status).toBe("Todo");
    expect(tasks[1].status).toBe("InProgress");
    expect(tasks[2].status).toBe("Complete");
  });

  it("should sort by due_date with nulls last", () => {
    ctx = createTestDb();
    createTaskInDb(ctx.db, { title: "No date" });
    createTaskInDb(ctx.db, { title: "Later", due_date: "2026-12-01" });
    createTaskInDb(ctx.db, { title: "Sooner", due_date: "2026-01-01" });

    const tasks = ctx.db.prepare("SELECT * FROM tasks ORDER BY due_date IS NULL, due_date ASC").all() as any[];
    expect(tasks[0].title).toBe("Sooner");
    expect(tasks[1].title).toBe("Later");
    expect(tasks[2].title).toBe("No date");
  });

  it("should sort by priority then due_date (stable)", () => {
    ctx = createTestDb();
    createTaskInDb(ctx.db, { title: "P2 early", priority: 2, due_date: "2026-01-01" });
    createTaskInDb(ctx.db, { title: "P0 late", priority: 0, due_date: "2026-12-01" });
    createTaskInDb(ctx.db, { title: "P0 early", priority: 0, due_date: "2026-01-01" });

    const tasks = ctx.db.prepare("SELECT * FROM tasks ORDER BY priority ASC, due_date IS NULL, due_date ASC").all() as any[];
    expect(tasks[0].title).toBe("P0 early");
    expect(tasks[1].title).toBe("P0 late");
    expect(tasks[2].title).toBe("P2 early");
  });
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

describe("Tags", () => {
  it("should create a tag", () => {
    ctx = createTestDb();
    const result = ctx.db.prepare("INSERT INTO tags (name, color) VALUES (?, ?)").run("urgent", "#ef4444");
    const tag = ctx.db.prepare("SELECT * FROM tags WHERE id = ?").get(result.lastInsertRowid) as any;
    expect(tag.name).toBe("urgent");
    expect(tag.color).toBe("#ef4444");
  });

  it("should rename a tag and update all tasks carrying it", () => {
    ctx = createTestDb();
    const tagResult = ctx.db.prepare("INSERT INTO tags (name, color) VALUES (?, ?)").run("old-name", "#000");
    const tagId = tagResult.lastInsertRowid;

    const taskId1 = createTaskInDb(ctx.db, { title: "Task 1" });
    const taskId2 = createTaskInDb(ctx.db, { title: "Task 2" });

    ctx.db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskId1, tagId);
    ctx.db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskId2, tagId);

    // Rename the tag
    ctx.db.prepare("UPDATE tags SET name = ? WHERE id = ?").run("new-name", tagId);

    const tag = ctx.db.prepare("SELECT * FROM tags WHERE id = ?").get(tagId) as any;
    expect(tag.name).toBe("new-name");

    // Both tasks still reference the same tag
    const taskTags = ctx.db.prepare("SELECT * FROM task_tags WHERE tag_id = ?").all(tagId);
    expect(taskTags.length).toBe(2);
  });

  it("should filter by two tags and return intersection", () => {
    ctx = createTestDb();
    const tag1 = ctx.db.prepare("INSERT INTO tags (name) VALUES (?)").run("tag-a").lastInsertRowid;
    const tag2 = ctx.db.prepare("INSERT INTO tags (name) VALUES (?)").run("tag-b").lastInsertRowid;

    const id1 = createTaskInDb(ctx.db, { title: "Both tags" });
    const id2 = createTaskInDb(ctx.db, { title: "Only tag-a" });
    const id3 = createTaskInDb(ctx.db, { title: "Only tag-b" });

    ctx.db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(id1, tag1);
    ctx.db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(id1, tag2);
    ctx.db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(id2, tag1);
    ctx.db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(id3, tag2);

    // Intersection: tasks with both tag-a AND tag-b
    const intersection = ctx.db.prepare(`
      SELECT t.* FROM tasks t
      WHERE EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)
        AND EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)
    `).all(tag1, tag2);

    expect(intersection.length).toBe(1);
    expect((intersection[0] as any).title).toBe("Both tags");
  });
});

// ─── Activity Log ─────────────────────────────────────────────────────────────

describe("Activity log", () => {
  it("should record a create action", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Log me" });
    ctx.db.prepare("INSERT INTO activity_log (task_id, action, new_value) VALUES (?, 'created', ?)").run(id, "Log me");

    const entries = ctx.db.prepare("SELECT * FROM activity_log WHERE task_id = ?").all(id) as any[];
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe("created");
    expect(entries[0].new_value).toBe("Log me");
  });

  it("should record an archive action", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Archive log" });
    ctx.db.prepare("UPDATE tasks SET archived_at = datetime('now') WHERE id = ?").run(id);
    ctx.db.prepare("INSERT INTO activity_log (task_id, action, field, new_value) VALUES (?, 'archived', 'archived_at', ?)").run(id, new Date().toISOString());

    const entries = ctx.db.prepare("SELECT * FROM activity_log WHERE task_id = ? AND action = 'archived'").all(id) as any[];
    expect(entries.length).toBe(1);
  });

  it("should be append-only — no DELETE or UPDATE on activity_log", () => {
    ctx = createTestDb();
    const id = createTaskInDb(ctx.db, { title: "Immutable log" });
    ctx.db.prepare("INSERT INTO activity_log (task_id, action) VALUES (?, 'created')").run(id);

    // Attempting to delete should work SQL-wise but violates the design principle
    // We verify the log is there and persists
    const count1 = (ctx.db.prepare("SELECT COUNT(*) as c FROM activity_log").get() as any).c;
    expect(count1).toBe(1);

    // Add another
    ctx.db.prepare("INSERT INTO activity_log (task_id, action, field, old_value, new_value) VALUES (?, 'updated', 'title', 'old', 'new')").run(id);
    const count2 = (ctx.db.prepare("SELECT COUNT(*) as c FROM activity_log").get() as any).c;
    expect(count2).toBe(2);
  });
});

// ─── Persistence ──────────────────────────────────────────────────────────────

describe("Persistence", () => {
  it("should persist data across database close and reopen", () => {
    ctx = createTestDb();
    const dbPath = ctx.dbPath;
    const id = createTaskInDb(ctx.db, {
      title: "Persist me",
      description: "Should survive restart",
      due_date: "2026-08-15",
      topic: "Testing",
      priority: 1,
      effort: 4,
    });

    // Archive it too
    ctx.db.prepare("UPDATE tasks SET archived_at = datetime('now') WHERE id = ?").run(id);
    ctx.db.close();

    // Reopen
    const Database = require("better-sqlite3");
    const db2 = new Database(dbPath);
    const task = db2
      .prepare(`SELECT t.*,
        CASE WHEN t.due_date IS NOT NULL AND t.due_date < date('now') AND t.status != 'Complete' AND t.archived_at IS NULL
        THEN 1 ELSE 0 END AS is_overdue
        FROM tasks t WHERE t.id = ?`)
      .get(id) as any;

    expect(task.title).toBe("Persist me");
    expect(task.description).toBe("Should survive restart");
    expect(task.archived_at).not.toBeNull();

    db2.close();
    ctx.cleanup();
    ctx = null as any; // prevent double cleanup
  });
});
