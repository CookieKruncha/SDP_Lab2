# Todo App — COMS3011A Lab 2

A local-first todo application built with **Next.js** and **SQLite**. Single user, no accounts, runs locally via Node.js.

## Running It

**Node version:** 18.x (tested on 18.19.1)

```bash
# Install dependencies
npm install

# Run database migrations (automatic on first run)
# Start the development server
npm run dev

# Build for production
npm run build && npm start
```

The app opens at [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run the test suite (31 tests, throwaway DB) |
| `npm run seed` | Populate the database with ~500 realistic tasks |
| `npm run export-data -- --format=json` | Export all data as JSON |
| `npm run export-data -- --format=csv` | Export tasks as CSV |
| `npm run export-data -- --format=md` | Export tasks as Markdown |
| `npm run import-data -- --file=export.json` | Import from a JSON export |

## Third-Party Code

| Package | Why |
|---------|-----|
| `next` (14.2) | React framework with App Router and server actions for full-stack simplicity |
| `react` / `react-dom` (18.x) | UI library required by Next.js |
| `better-sqlite3` | Synchronous SQLite3 bindings for Node.js — fast, reliable, no async overhead |
| `tailwindcss` (3.4) | Utility-first CSS for rapid UI development without writing custom stylesheets |
| `fuse.js` | Lightweight fuzzy-search library for the command palette |
| `date-fns` | Date utility library for formatting and relative date calculations |
| `vitest` | Fast Vite-native test runner, compatible with the project's toolchain |
| `tsx` | TypeScript executor for running scripts (seed, export, import) directly |
| `typescript` | Type safety across the project |

## Database Design

### Tables

**tasks** — The core entity. Every piece of task state lives here.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `title` | TEXT NOT NULL | Task title |
| `description` | TEXT | Optional longer description |
| `due_date` | TEXT | ISO date (YYYY-MM-DD), nullable |
| `topic` | TEXT | Free-form topic label |
| `status` | TEXT | `Todo`, `InProgress`, or `Complete` — fixed, enforced by CHECK |
| `archived_at` | TEXT | NULL = active; ISO timestamp = archived. **Never deleted** |
| `priority` | INTEGER | 0 (P0/critical) to 3 (P3/low), default 2 |
| `effort` | INTEGER | Estimated hours, default 0 |
| `created_at` | TEXT | ISO datetime, auto-set |
| `updated_at` | TEXT | ISO datetime, auto-set on updates |

**tags** — Free-form labels.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT UNIQUE | Tag name |
| `color` | TEXT | Hex colour code |

**task_tags** — Many-to-many join table (proper join, not comma-separated).

| Column | Type | Notes |
|--------|------|-------|
| `task_id` | INTEGER FK | References tasks(id) |
| `tag_id` | INTEGER FK | References tags(id) ON DELETE CASCADE |

**activity_log** — Append-only mutation history. Never edited or deleted.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `task_id` | INTEGER | Related task (nullable for system events) |
| `action` | TEXT | `created`, `updated`, `archived`, `unarchived`, `undo_*` |
| `field` | TEXT | Which field changed (nullable) |
| `old_value` | TEXT | Previous value |
| `new_value` | TEXT | New value |
| `created_at` | TEXT | When the mutation occurred |

**saved_views** — Persisted filter/sort/view combinations (in SQLite, not browser storage).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | User-given name |
| `filter_json` | TEXT | JSON-encoded filter state |
| `sort_by` | TEXT | Sort column |
| `view_type` | TEXT | `list`, `today`, `kanban` |

**settings** — Key-value store for app settings (theme, density). Persisted in SQLite.

**schema_migrations** — Tracks which migrations have been applied.

### Relationships

- **tasks ↔ tags** (many-to-many): Mediated by the `task_tags` join table. A task can carry many tags; a tag can label many tasks. `task_tags.task_id` references `tasks(id)` and `task_tags.tag_id` references `tags(id)` with `ON DELETE CASCADE` — removing a tag cleans up its associations automatically. Filtering by multiple tags uses intersection (each tag adds an `EXISTS` subquery).
- **tasks → activity_log** (one-to-many): `activity_log.task_id` references the task that was mutated. Every create, edit, archive and status change writes a log row in the **same transaction** as the mutation. The log is append-only — it is never updated or deleted.
- **tasks ↔ tasks_fts** (one-to-one virtual): The `tasks_fts` FTS5 virtual table mirrors `tasks.title` and `tasks.description` for full-text search. SQLite triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE` on `tasks`) keep the index in sync automatically.
- **settings** is a standalone key-value store with no foreign keys — it holds app-level preferences (theme, density) that must survive a restart.
- **saved_views** is a standalone table — it stores serialised filter/sort/view state as JSON, with no foreign keys.

### Key Design Decisions

- **Overdue is derived, never stored.** Computed at read time from `due_date < date('now') AND status != 'Complete' AND archived_at IS NULL`.
- **Archive is a timestamp flag**, not a DELETE. No row is ever removed from the tasks table.
- **Three fixed statuses** enforced by CHECK constraint: `Todo`, `InProgress`, `Complete`.
- **Activity log is append-only** — written in the same transaction as the mutation.
- **FTS5 virtual table** for full-text search, kept in sync via triggers.

## AI Usage

This repository makes use of AI code generation using the following tools: Qoder[Claude].
This repository does not use AI in-line editing tools.
This repository does not use AI code review.
