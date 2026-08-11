import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "todo.db");
const args = process.argv.slice(2);
const inFile = args.find((a) => a.startsWith("--file="))?.split("=")[1];

if (!inFile) {
  console.error("Usage: npx tsx scripts/import.ts --file=<path-to-export.json>");
  process.exit(1);
}

function importData() {
  const filePath = inFile!;
  const raw = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (ext === ".json") {
    const data = JSON.parse(raw);
    const rejected: string[] = [];

    const txn = db.transaction(() => {
      // Clear existing data for clean import
      db.exec("DELETE FROM task_tags");
      db.exec("DELETE FROM tags");
      db.exec("DELETE FROM tasks");
      db.exec("DELETE FROM activity_log");

      // Import tags
      if (data.tags) {
        const insertTag = db.prepare("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)");
        for (const tag of data.tags) {
          try {
            insertTag.run(tag.id, tag.name, tag.color, tag.created_at);
          } catch (e: any) {
            rejected.push(`Tag ${tag.id}: ${e.message}`);
          }
        }
      }

      // Import tasks
      if (data.tasks) {
        const insertTask = db.prepare(
          `INSERT INTO tasks (id, title, description, due_date, topic, status, archived_at, priority, effort, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        let imported = 0;
        for (const t of data.tasks) {
          try {
            insertTask.run(
              t.id, t.title, t.description ?? "", t.due_date ?? null,
              t.topic ?? "", t.status, t.archived_at ?? null,
              t.priority ?? 2, t.effort ?? 0, t.created_at, t.updated_at
            );
            imported++;
          } catch (e: any) {
            rejected.push(`Task ${t.id} (line ${imported + 1}): ${e.message}`);
          }
        }
      }

      // Import task_tags
      if (data.taskTags) {
        const insertTT = db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)");
        for (const tt of data.taskTags) {
          try {
            insertTT.run(tt.task_id, tt.tag_id);
          } catch (e: any) {
            rejected.push(`TaskTag ${tt.task_id}/${tt.tag_id}: ${e.message}`);
          }
        }
      }

      // Import activity_log
      if (data.activityLog) {
        const insertLog = db.prepare(
          "INSERT INTO activity_log (id, task_id, action, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        for (const a of data.activityLog) {
          try {
            insertLog.run(a.id, a.task_id, a.action, a.field ?? null, a.old_value ?? null, a.new_value ?? null, a.created_at);
          } catch (e: any) {
            rejected.push(`Activity ${a.id}: ${e.message}`);
          }
        }
      }
    });

    txn();

    const taskCount = (db.prepare("SELECT COUNT(*) as c FROM tasks").get() as any).c;
    const tagCount = (db.prepare("SELECT COUNT(*) as c FROM tags").get() as any).c;
    console.log(`Imported: ${taskCount} tasks, ${tagCount} tags from ${inFile}`);
    if (rejected.length > 0) {
      console.log(`\nRejected ${rejected.length} rows:`);
      rejected.forEach((r) => console.log(`  - ${r}`));
    }
  } else if (ext === ".csv") {
    // CSV import (tasks only)
    const lines = raw.split("\n").filter((l) => l.trim());
    const header = lines[0].split(",");
    const rejected: string[] = [];

    const txn = db.transaction(() => {
      const insertTask = db.prepare(
        `INSERT INTO tasks (title, description, due_date, topic, status, archived_at, priority, effort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          header.forEach((h, idx) => (row[h.trim()] = values[idx] ?? ""));

          insertTask.run(
            row.title ?? "",
            row.description ?? "",
            row.due_date || null,
            row.topic ?? "",
            row.status ?? "Todo",
            row.archived_at || null,
            Number(row.priority) || 2,
            Number(row.effort) || 0
          );
        } catch (e: any) {
          rejected.push(`Line ${i + 1}: ${e.message}`);
        }
      }
    });

    txn();

    const count = (db.prepare("SELECT COUNT(*) as c FROM tasks").get() as any).c;
    console.log(`Imported ${count} tasks from ${inFile}`);
    if (rejected.length > 0) {
      console.log(`\nRejected ${rejected.length} rows:`);
      rejected.forEach((r) => console.log(`  - ${r}`));
    }
  } else {
    console.error(`Unsupported format: ${ext}. Use .json or .csv`);
    process.exit(1);
  }

  db.close();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

importData();
