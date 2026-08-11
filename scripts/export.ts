import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "todo.db");
const args = process.argv.slice(2);
const format = args.find((a) => a.startsWith("--format="))?.split("=")[1] ?? "json";
const outFile = args.find((a) => a.startsWith("--out="))?.split("=")[1] ?? `export.${format}`;

function exportData() {
  const db = new Database(DB_PATH, { readonly: true });

  const tasks = db.prepare("SELECT * FROM tasks ORDER BY id").all() as any[];
  const tags = db.prepare("SELECT * FROM tags ORDER BY id").all() as any[];
  const taskTags = db.prepare("SELECT * FROM task_tags ORDER BY task_id, tag_id").all() as any[];
  const activityLog = db.prepare("SELECT * FROM activity_log ORDER BY id").all() as any[];
  const savedViews = db.prepare("SELECT * FROM saved_views ORDER BY id").all() as any[];
  const settings = db.prepare("SELECT * FROM settings ORDER BY key").all() as any[];

  db.close();

  if (format === "json") {
    const data = { tasks, tags, taskTags, activityLog, savedViews, settings };
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`Exported to ${outFile} (JSON): ${tasks.length} tasks, ${tags.length} tags`);
  } else if (format === "csv") {
    // Export tasks as CSV
    const header = "id,title,description,due_date,topic,status,archived_at,priority,effort,created_at,updated_at";
    const rows = tasks.map((t) =>
      [
        t.id,
        `"${(t.title ?? "").replace(/"/g, '""')}"`,
        `"${(t.description ?? "").replace(/"/g, '""')}"`,
        t.due_date ?? "",
        `"${(t.topic ?? "").replace(/"/g, '""')}"`,
        t.status,
        t.archived_at ?? "",
        t.priority,
        t.effort,
        t.created_at,
        t.updated_at,
      ].join(",")
    );
    fs.writeFileSync(outFile, [header, ...rows].join("\n"));
    console.log(`Exported to ${outFile} (CSV): ${tasks.length} tasks`);
  } else if (format === "md" || format === "markdown") {
    // Export as Markdown
    let md = "# Todo Export\n\n";
    md += `## Tasks (${tasks.length})\n\n`;
    for (const t of tasks) {
      const check = t.status === "Complete" ? "x" : " ";
      const archived = t.archived_at ? " *(archived)*" : "";
      md += `- [${check}] **${t.title}**${archived}\n`;
      if (t.description) md += `  ${t.description}\n`;
      if (t.due_date) md += `  Due: ${t.due_date}`;
      if (t.topic) md += ` | Topic: ${t.topic}`;
      if (t.priority !== undefined) md += ` | P${t.priority}`;
      md += "\n\n";
    }
    fs.writeFileSync(outFile, md);
    console.log(`Exported to ${outFile} (Markdown): ${tasks.length} tasks`);
  } else {
    console.error(`Unknown format: ${format}. Use json, csv, or md.`);
    process.exit(1);
  }
}

exportData();
