"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTasks,
  createTask,
  updateTask,
  archiveTask,
  unarchiveTask,
  getTodayTasks,
  searchTasks,
  listSavedViews,
  createSavedView,
  deleteSavedView,
  undoLastAction,
  redoLastAction,
  getActivityFeed,
  getTaskHistory,
  getStats,
  listTags,
  createTag,
  renameTag,
  colorTag,
  deleteTag,
  addTagToTask,
  removeTagFromTask,
  getTaskTags,
  getSetting,
  setSetting,
} from "@/lib/actions";
import type { Task, Tag, SavedView, ActivityEntry, SortBy } from "@/lib/actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function priorityLabel(p: number) {
  return ["P0", "P1", "P2", "P3"][p] ?? "P2";
}

function priorityColor(p: number) {
  return ["bg-red-600", "bg-orange-500", "bg-yellow-500", "bg-gray-400"][p] ?? "bg-gray-400";
}

function statusColor(s: string) {
  if (s === "Todo") return "border-gray-300 dark:border-gray-600";
  if (s === "InProgress") return "border-blue-500";
  if (s === "Complete") return "border-green-500";
  return "";
}

// ─── Main App ─────────────────────────────────────────────────────────────────

type View = "list" | "today" | "kanban" | "activity" | "stats";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>("list");
  const [sortBy, setSortBy] = useState<SortBy>("due_date");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(Task & { snippet: string })[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [taskTagsMap, setTaskTagsMap] = useState<Record<number, Tag[]>>({});
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [stats, setStats] = useState<any>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [taskHistory, setTaskHistory] = useState<ActivityEntry[]>([]);
  const [showHistoryId, setShowHistoryId] = useState<number | null>(null);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("#6366f1");

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newPriority, setNewPriority] = useState(2);
  const [newEffort, setNewEffort] = useState(0);

  // Edit form
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editStatus, setEditStatus] = useState<string>("Todo");
  const [editPriority, setEditPriority] = useState(2);
  const [editEffort, setEditEffort] = useState(0);

  // ─── Load data ────────────────────────────────────────────────────────────────

  const refreshTasks = useCallback(async () => {
    if (view === "today") {
      const t = await getTodayTasks();
      setTasks(t);
    } else if (view === "kanban") {
      const t = await listTasks({ sortBy: "status", tagIds: selectedTagIds.length ? selectedTagIds : undefined });
      setTasks(t);
    } else {
      const t = await listTasks({
        sortBy,
        includeArchived: showArchived,
        tagIds: selectedTagIds.length ? selectedTagIds : undefined,
        searchQuery: searchQuery || undefined,
      });
      setTasks(t);
    }
  }, [view, sortBy, showArchived, selectedTagIds, searchQuery]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    listTags().then(setTags);
    listSavedViews().then(setSavedViews);
    getActivityFeed(100).then(setActivityFeed);
    getStats().then(setStats);
  }, []);

  // Load task tags for visible tasks
  useEffect(() => {
    const loadTags = async () => {
      const map: Record<number, Tag[]> = {};
      await Promise.all(
        tasks.map(async (t) => {
          map[t.id] = await getTaskTags(t.id);
        })
      );
      setTaskTagsMap(map);
    };
    if (tasks.length > 0 && tasks.length <= 200) loadTags();
  }, [tasks]);

  // Theme — persisted in SQLite settings table (localStorage as instant-render cache)
  useEffect(() => {
    // Apply immediately from localStorage cache to prevent flash
    const cached = localStorage.getItem("theme");
    if (cached === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else if (!cached && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
    const cachedD = localStorage.getItem("density");
    if (cachedD === "compact") setDensity("compact");

    // Load authoritative value from SQLite and reconcile
    getSetting("theme").then((v) => {
      if (v === "dark" || v === "light") {
        setTheme(v as "light" | "dark");
        localStorage.setItem("theme", v);
      }
    });
    getSetting("density").then((v) => {
      if (v === "compact" || v === "comfortable") {
        setDensity(v as "comfortable" | "compact");
        localStorage.setItem("density", v);
      }
    });
  }, []);

  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoLastAction().then(() => { refreshTasks(); getActivityFeed(100).then(setActivityFeed); });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redoLastAction().then(() => { refreshTasks(); getActivityFeed(100).then(setActivityFeed); });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redoLastAction().then(() => { refreshTasks(); getActivityFeed(100).then(setActivityFeed); });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshTasks]);

  // Search debounce
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchTasks(searchQuery);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ─── Actions ──────────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createTask({
      title: newTitle.trim(),
      description: newDesc,
      due_date: newDueDate || undefined,
      topic: newTopic,
      priority: newPriority,
      effort: newEffort,
    });
    setNewTitle("");
    setNewDesc("");
    setNewDueDate("");
    setNewTopic("");
    setNewPriority(2);
    setNewEffort(0);
    setShowCreateForm(false);
    refreshTasks();
    getStats().then(setStats);
    getActivityFeed(100).then(setActivityFeed);
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditDueDate(task.due_date ?? "");
    setEditTopic(task.topic);
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditEffort(task.effort);
  }

  async function saveEdit(id: number) {
    await updateTask(id, {
      title: editTitle,
      description: editDesc,
      due_date: editDueDate || null,
      topic: editTopic,
      status: editStatus as any,
      priority: editPriority,
      effort: editEffort,
    });
    setEditingId(null);
    refreshTasks();
    getStats().then(setStats);
    getActivityFeed(100).then(setActivityFeed);
  }

  async function handleArchive(id: number) {
    await archiveTask(id);
    refreshTasks();
    getStats().then(setStats);
    getActivityFeed(100).then(setActivityFeed);
  }

  async function handleUnarchive(id: number) {
    await unarchiveTask(id);
    refreshTasks();
  }

  async function handleStatusChange(id: number, status: string) {
    await updateTask(id, { status: status as any });
    refreshTasks();
    getStats().then(setStats);
    getActivityFeed(100).then(setActivityFeed);
  }

  async function handleSaveView() {
    if (!newViewName.trim()) return;
    await createSavedView({
      name: newViewName.trim(),
      filter_json: JSON.stringify({ tagIds: selectedTagIds, showArchived }),
      sort_by: sortBy,
      view_type: view,
    });
    listSavedViews().then(setSavedViews);
    setShowSaveViewDialog(false);
    setNewViewName("");
  }

  async function handleLoadView(sv: SavedView) {
    const filter = JSON.parse(sv.filter_json);
    setSortBy(sv.sort_by as SortBy);
    setView(sv.view_type as View);
    if (filter.tagIds) setSelectedTagIds(filter.tagIds);
    if (filter.showArchived !== undefined) setShowArchived(filter.showArchived);
  }

  async function handleDeleteView(id: number) {
    await deleteSavedView(id);
    listSavedViews().then(setSavedViews);
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    await createTag(newTagName.trim(), newTagColor);
    listTags().then(setTags);
    setShowCreateTag(false);
    setNewTagName("");
    setNewTagColor("#6366f1");
  }

  async function handleRenameTag() {
    if (editingTagId === null || !editTagName.trim()) return;
    await renameTag(editingTagId, editTagName.trim());
    if (editTagColor !== "") await colorTag(editingTagId, editTagColor);
    setEditingTagId(null);
    listTags().then(setTags);
  }

  async function handleDeleteTag(id: number) {
    await deleteTag(id);
    setSelectedTagIds((prev: number[]) => prev.filter((tid: number) => tid !== id));
    listTags().then(setTags);
  }

  async function loadTaskHistory(taskId: number) {
    const history = await getTaskHistory(taskId);
    setTaskHistory(history);
    setShowHistoryId(taskId);
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    setSetting("theme", next); // persist to SQLite
  }

  function toggleDensity() {
    const next = density === "comfortable" ? "compact" : "comfortable";
    setDensity(next);
    localStorage.setItem("density", next);
    setSetting("density", next); // persist to SQLite
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const activeTasks = tasks.filter((t) => !t.archived_at);
  const archivedTasks = tasks.filter((t) => t.archived_at);

  return (
    <div className={`min-h-screen density-${density}`} style={{ background: "var(--bg)", color: "var(--fg)" }}>
      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          tasks={tasks}
          onClose={() => setShowCommandPalette(false)}
          onSelect={(action) => {
            setShowCommandPalette(false);
            if (action === "list") setView("list");
            else if (action === "today") setView("today");
            else if (action === "kanban") setView("kanban");
            else if (action === "activity") setView("activity");
            else if (action === "create") setShowCreateForm(true);
            else if (action === "undo") undoLastAction().then(() => { refreshTasks(); getActivityFeed(100).then(setActivityFeed); });
            else if (action === "redo") redoLastAction().then(() => { refreshTasks(); getActivityFeed(100).then(setActivityFeed); });
          }}
          onTaskSelect={(taskId) => {
            setShowCommandPalette(false);
            const task = tasks.find((t) => t.id === taskId);
            if (task) startEdit(task);
          }}
        />
      )}

      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Todo App</h1>
          <nav className="flex gap-1">
            {(["list", "today", "kanban", "activity", "stats"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  view === v
                    ? "text-white"
                    : "hover:opacity-80"
                }`}
                style={{
                  background: view === v ? "var(--accent)" : "transparent",
                  color: view === v ? "white" : "var(--fg)",
                }}
              >
                {v === "stats" ? "Stats" : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded text-sm"
              style={{ background: "var(--card)" }}
              title="Toggle theme"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <button
              onClick={toggleDensity}
              className="p-2 rounded text-sm"
              style={{ background: "var(--card)" }}
              title="Toggle density"
            >
              {density === "compact" ? "⊞" : "⊟"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 space-y-6">
          {/* Stats */}
          {stats && (
            <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="font-semibold text-sm mb-2">Overview</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-bold">{stats.total}</span> <span style={{ color: "var(--muted)" }}>total</span></div>
                <div><span className="font-bold" style={{ color: "var(--success)" }}>{stats.completed}</span> <span style={{ color: "var(--muted)" }}>done</span></div>
                <div><span className="font-bold" style={{ color: "var(--accent)" }}>{stats.inProgress}</span> <span style={{ color: "var(--muted)" }}>active</span></div>
                <div><span className="font-bold" style={{ color: "var(--overdue)" }}>{stats.overdue}</span> <span style={{ color: "var(--muted)" }}>overdue</span></div>
              </div>
            </div>
          )}

          {/* Tags filter */}
          <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Tags</h3>
              <button onClick={() => setShowCreateTag(!showCreateTag)} className="text-xs" style={{ color: "var(--accent)" }}>+ Add</button>
            </div>
            {showCreateTag && (
              <div className="mb-2 space-y-1">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  className="w-full px-2 py-1 rounded text-sm border"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-full h-6 rounded cursor-pointer"
                />
                <button onClick={handleCreateTag} className="w-full py-1 rounded text-sm text-white" style={{ background: "var(--accent)" }}>Create</button>
              </div>
            )}
            <div className="space-y-1">
              {tags.map((tag) => (
                <div key={tag.id} className="group">
                  {editingTagId === tag.id ? (
                    <div className="space-y-1 p-1 rounded" style={{ background: "var(--bg)" }}>
                      <input
                        value={editTagName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTagName(e.target.value)}
                        className="w-full px-2 py-0.5 rounded text-xs border"
                        style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                        autoFocus
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={editTagColor}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTagColor(e.target.value)}
                          className="w-6 h-5 rounded cursor-pointer"
                        />
                        <button onClick={handleRenameTag} className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: "var(--accent)" }}>Save</button>
                        <button onClick={() => setEditingTagId(null)} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--border)" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTagIds.includes(tag.id)}
                          onChange={() => {
                            setSelectedTagIds((prev: number[]) =>
                              prev.includes(tag.id) ? prev.filter((id: number) => id !== tag.id) : [...prev, tag.id]
                            );
                          }}
                        />
                        <span className="w-3 h-3 rounded-full" style={{ background: tag.color }} />
                        <span>{tag.name}</span>
                      </label>
                      <div className="hidden group-hover:flex gap-0.5">
                        <button
                          onClick={() => { setEditingTagId(tag.id); setEditTagName(tag.name); setEditTagColor(tag.color); }}
                          className="text-xs px-1 rounded opacity-60 hover:opacity-100"
                          style={{ color: "var(--accent)" }}
                          title="Edit tag"
                        >✎</button>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          className="text-xs px-1 rounded opacity-60 hover:opacity-100 text-red-500"
                          title="Delete tag"
                        >×</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Saved Views */}
          <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Saved Views</h3>
              <button onClick={() => setShowSaveViewDialog(!showSaveViewDialog)} className="text-xs" style={{ color: "var(--accent)" }}>+ Save</button>
            </div>
            {showSaveViewDialog && (
              <div className="mb-2 flex gap-1">
                <input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="View name"
                  className="flex-1 px-2 py-1 rounded text-sm border"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                />
                <button onClick={handleSaveView} className="px-2 py-1 rounded text-sm text-white" style={{ background: "var(--accent)" }}>Save</button>
              </div>
            )}
            <div className="space-y-1">
              {savedViews.map((sv) => (
                <div key={sv.id} className="flex items-center justify-between text-sm group">
                  <button
                    onClick={() => handleLoadView(sv)}
                    className="flex-1 text-left hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {sv.name}
                  </button>
                  <button
                    onClick={() => handleDeleteView(sv.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sort (list view only) */}
          {view === "list" && (
            <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="font-semibold text-sm mb-2">Sort by</h3>
              <div className="space-y-1">
                {(["due_date", "topic", "status", "priority"] as SortBy[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`block w-full text-left text-sm px-2 py-1 rounded ${
                      sortBy === s ? "font-bold" : ""
                    }`}
                    style={{
                      background: sortBy === s ? "var(--accent)" : "transparent",
                      color: sortBy === s ? "white" : "var(--fg)",
                    }}
                  >
                    {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Search bar */}
          <div className="mb-4">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks... (Ctrl+K for command palette)"
              className="w-full px-4 py-2 rounded-lg border text-sm"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--fg)" }}
            />
            {searchResults.length > 0 && (
              <div className="mt-1 rounded-lg border p-2 space-y-1" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => startEdit(r)}
                    className="w-full text-left px-2 py-1 rounded text-sm hover:opacity-80"
                    style={{ background: "var(--bg)" }}
                  >
                    <span className="font-medium">{r.title}</span>
                    {r.snippet && (
                      <span className="ml-2 text-xs" style={{ color: "var(--muted)" }} dangerouslySetInnerHTML={{ __html: r.snippet }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create button */}
          {!showCreateForm && view !== "activity" && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="mb-4 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: "var(--accent)" }}
            >
              + New Task
            </button>
          )}

          {/* Create form */}
          {showCreateForm && (
            <form onSubmit={handleCreate} className="mb-4 rounded-lg p-4 border space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-semibold">Create Task</h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title *"
                className="w-full px-3 py-2 rounded border text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                autoFocus
                required
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description"
                rows={2}
                className="w-full px-3 py-2 rounded border text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Due Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Topic</label>
                  <input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="e.g. COMS3011A"
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                  >
                    <option value={0}>P0 — Critical</option>
                    <option value={1}>P1 — High</option>
                    <option value={2}>P2 — Normal</option>
                    <option value={3}>P3 — Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Effort (hours)</label>
                  <input
                    type="number"
                    min={0}
                    value={newEffort}
                    onChange={(e) => setNewEffort(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 rounded text-white text-sm font-medium" style={{ background: "var(--accent)" }}>
                  Create
                </button>
                <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 rounded text-sm" style={{ background: "var(--border)" }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Activity view */}
          {view === "activity" && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold mb-3">Activity Log</h2>
              {activityFeed.map((entry) => (
                <div key={entry.id} className="rounded-lg p-3 border text-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{entry.task_title ?? `Task #${entry.task_id}`}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    <span className="font-medium" style={{ color: "var(--accent)" }}>{entry.action}</span>
                    {entry.field && <span> {entry.field}</span>}
                    {entry.old_value && <span> &quot;{entry.old_value}&quot;</span>}
                    {entry.new_value && <span> → &quot;{entry.new_value}&quot;</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Statistics view */}
          {view === "stats" && stats && (
            <StatsView stats={stats} activityFeed={activityFeed} />
          )}

          {/* Task History Modal */}
          {showHistoryId !== null && (
            <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={() => setShowHistoryId(null)}>
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="relative w-full max-w-lg max-h-96 overflow-y-auto rounded-xl p-4 shadow-2xl"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Task History</h3>
                  <button onClick={() => setShowHistoryId(null)} className="text-sm px-2 py-1 rounded" style={{ background: "var(--border)" }}>Close</button>
                </div>
                <div className="space-y-2">
                  {taskHistory.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>No history for this task.</p>}
                  {taskHistory.map((entry) => (
                    <div key={entry.id} className="text-sm p-2 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium" style={{ color: "var(--accent)" }}>{entry.action}</span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{new Date(entry.created_at).toLocaleString()}</span>
                      </div>
                      {entry.field && (
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          <span className="font-medium">{entry.field}</span>
                          {entry.old_value && <span>: &quot;{entry.old_value}&quot;</span>}
                          {entry.new_value && <span> → &quot;{entry.new_value}&quot;</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Kanban view */}
          {view === "kanban" && (
            <div className="grid grid-cols-3 gap-4">
              {["Todo", "InProgress", "Complete"].map((status) => {
                const colTasks = activeTasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="rounded-lg p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${status === "Todo" ? "bg-gray-400" : status === "InProgress" ? "bg-blue-500" : "bg-green-500"}`} />
                      {status === "InProgress" ? "In Progress" : status}
                      <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>({colTasks.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {colTasks.map((task) => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("taskId", String(task.id))}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={async (e) => {
                            e.preventDefault();
                            const taskId = Number(e.dataTransfer.getData("taskId"));
                            await handleStatusChange(taskId, status);
                          }}
                          className="task-card rounded-lg p-3 cursor-pointer border-l-4"
                          style={{ background: "var(--bg)", borderLeftColor: task.is_overdue ? "var(--overdue)" : "var(--border)" }}
                          onClick={() => startEdit(task)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`text-sm font-medium ${task.status === "Complete" ? "line-through opacity-60" : ""}`}>
                              {task.title}
                            </h4>
                            <span className={`text-xs px-1.5 py-0.5 rounded text-white ${priorityColor(task.priority)}`}>
                              {priorityLabel(task.priority)}
                            </span>
                          </div>
                          {task.due_date && (
                            <div className="text-xs mt-1" style={{ color: task.is_overdue ? "var(--overdue)" : "var(--muted)" }}>
                              {task.is_overdue && "⚠ "}{formatDate(task.due_date)}
                            </div>
                          )}
                          {task.topic && (
                            <div className="text-xs mt-1 px-2 py-0.5 rounded inline-block" style={{ background: "var(--card)", color: "var(--muted)" }}>
                              {task.topic}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Today view */}
          {view === "today" && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Today</h2>
              {tasks.length === 0 ? (
                <div className="text-center py-16 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-medium">All clear!</p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No overdue tasks, nothing due today, and nothing in progress.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isEditing={editingId === task.id}
                      tags={taskTagsMap[task.id] ?? []}
                      editTitle={editTitle}
                      editDesc={editDesc}
                      editDueDate={editDueDate}
                      editTopic={editTopic}
                      editStatus={editStatus}
                      editPriority={editPriority}
                      editEffort={editEffort}
                      setEditTitle={setEditTitle}
                      setEditDesc={setEditDesc}
                      setEditDueDate={setEditDueDate}
                      setEditTopic={setEditTopic}
                      setEditStatus={setEditStatus}
                      setEditPriority={setEditPriority}
                      setEditEffort={setEditEffort}
                      onStartEdit={() => startEdit(task)}
                      onSaveEdit={() => saveEdit(task.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onArchive={() => handleArchive(task.id)}
                      onUnarchive={() => handleUnarchive(task.id)}
                      onStatusChange={(s) => handleStatusChange(task.id, s)}
                      onViewHistory={() => loadTaskHistory(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* List view */}
          {view === "list" && (
            <div>
              {/* Archived toggle */}
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={() => setShowArchived(!showArchived)}
                  />
                  Show archived
                </label>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {activeTasks.length} active{archivedTasks.length > 0 && `, ${archivedTasks.length} archived`}
                </span>
              </div>

              {/* Task list */}
              <div className="space-y-2">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isEditing={editingId === task.id}
                    tags={taskTagsMap[task.id] ?? []}
                    editTitle={editTitle}
                    editDesc={editDesc}
                    editDueDate={editDueDate}
                    editTopic={editTopic}
                    editStatus={editStatus}
                    editPriority={editPriority}
                    editEffort={editEffort}
                    setEditTitle={setEditTitle}
                    setEditDesc={setEditDesc}
                    setEditDueDate={setEditDueDate}
                    setEditTopic={setEditTopic}
                    setEditStatus={setEditStatus}
                    setEditPriority={setEditPriority}
                    setEditEffort={setEditEffort}
                    onStartEdit={() => startEdit(task)}
                    onSaveEdit={() => saveEdit(task.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onArchive={() => handleArchive(task.id)}
                    onUnarchive={() => handleUnarchive(task.id)}
                    onStatusChange={(s) => handleStatusChange(task.id, s)}
                    onViewHistory={() => loadTaskHistory(task.id)}
                  />
                ))}
              </div>

              {tasks.length === 0 && (
                <div className="text-center py-16 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="text-4xl mb-3">📝</div>
                  <p className="font-medium">No tasks yet</p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Create your first task to get started.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Task Row Component ───────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  isEditing: boolean;
  tags: Tag[];
  editTitle: string;
  editDesc: string;
  editDueDate: string;
  editTopic: string;
  editStatus: string;
  editPriority: number;
  editEffort: number;
  setEditTitle: (v: string) => void;
  setEditDesc: (v: string) => void;
  setEditDueDate: (v: string) => void;
  setEditTopic: (v: string) => void;
  setEditStatus: (v: string) => void;
  setEditPriority: (v: number) => void;
  setEditEffort: (v: number) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onStatusChange: (status: string) => void;
  onViewHistory: () => void;
}

function TaskRow({
  task,
  isEditing,
  tags,
  editTitle,
  editDesc,
  editDueDate,
  editTopic,
  editStatus,
  editPriority,
  editEffort,
  setEditTitle,
  setEditDesc,
  setEditDueDate,
  setEditTopic,
  setEditStatus,
  setEditPriority,
  setEditEffort,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onArchive,
  onUnarchive,
  onStatusChange,
  onViewHistory,
}: TaskRowProps) {
  if (isEditing) {
    return (
      <div className="task-card rounded-lg p-4 border-2" style={{ background: "var(--card)", borderColor: "var(--accent)" }}>
        <div className="space-y-2">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm font-medium"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
            autoFocus
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded border text-sm"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
          />
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full px-2 py-1 rounded border text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
              />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Topic</label>
              <input
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                className="w-full px-2 py-1 rounded border text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
              />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-2 py-1 rounded border text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
              >
                <option value="Todo">Todo</option>
                <option value="InProgress">In Progress</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--muted)" }}>Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(Number(e.target.value))}
                className="w-full px-2 py-1 rounded border text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
              >
                <option value={0}>P0</option>
                <option value={1}>P1</option>
                <option value={2}>P2</option>
                <option value={3}>P3</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="px-3 py-1.5 rounded text-white text-sm" style={{ background: "var(--accent)" }}>
              Save
            </button>
            <button onClick={onCancelEdit} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--border)" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`task-card rounded-lg p-4 border-l-4 cursor-pointer transition-all ${
        task.archived_at ? "opacity-60" : ""
      }`}
      style={{
        background: "var(--card)",
        borderLeftColor: task.is_overdue
          ? "var(--overdue)"
          : statusColor(task.status).includes("green")
          ? "#10b981"
          : statusColor(task.status).includes("blue")
          ? "#3b82f6"
          : "var(--border)",
      }}
      onClick={onStartEdit}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-medium text-sm ${task.status === "Complete" ? "line-through opacity-60" : ""}`}>
              {task.title}
            </h3>
            <span className={`text-xs px-1.5 py-0.5 rounded text-white shrink-0 ${priorityColor(task.priority)}`}>
              {priorityLabel(task.priority)}
            </span>
            {task.is_overdue && (
              <span className="text-xs px-1.5 py-0.5 rounded text-white bg-red-600 shrink-0">OVERDUE</span>
            )}
          </div>
          {task.description && (
            <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {task.due_date && <span>{task.is_overdue ? "⚠ " : "📅 "}{formatDate(task.due_date)}</span>}
            {task.topic && <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg)" }}>{task.topic}</span>}
            {task.effort > 0 && <span>⏱ {task.effort}h</span>}
            <span className={`px-1.5 py-0.5 rounded ${
              task.status === "Todo" ? "bg-gray-200 dark:bg-gray-700" :
              task.status === "InProgress" ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" :
              "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
            }`}>
              {task.status === "InProgress" ? "In Progress" : task.status}
            </span>
          </div>
          {tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {tags.map((tag) => (
                <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded" style={{ background: tag.color + "20", color: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Status quick-change buttons */}
          <div className="flex gap-1">
            {["Todo", "InProgress", "Complete"].map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                className={`text-xs px-2 py-1 rounded ${task.status === s ? "font-bold" : "opacity-50 hover:opacity-100"}`}
                style={{
                  background: task.status === s ? (s === "Complete" ? "#10b981" : s === "InProgress" ? "#3b82f6" : "var(--border)") : "transparent",
                  color: task.status === s ? "white" : "var(--muted)",
                }}
                title={s}
              >
                {s === "Todo" ? "○" : s === "InProgress" ? "◐" : "●"}
              </button>
            ))}
          </div>
          {task.archived_at ? (
            <button onClick={onUnarchive} className="text-xs px-2 py-1 rounded" style={{ background: "var(--border)" }}>
              Restore
            </button>
          ) : (
            <button onClick={onArchive} className="text-xs px-2 py-1 rounded text-red-500" style={{ background: "var(--border)" }}>
              Archive
            </button>
          )}
          <button onClick={onViewHistory} className="text-xs px-2 py-1 rounded" style={{ background: "var(--border)" }} title="View history">
            📜
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Command Palette Component ────────────────────────────────────────────────

interface CommandPaletteProps {
  tasks: Task[];
  onClose: () => void;
  onSelect: (action: string) => void;
  onTaskSelect: (taskId: number) => void;
}

function CommandPalette({ tasks, onClose, onSelect, onTaskSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    { id: "create", label: "Create new task", shortcut: "" },
    { id: "list", label: "Switch to List view", shortcut: "" },
    { id: "today", label: "Switch to Today view", shortcut: "" },
    { id: "kanban", label: "Switch to Kanban board", shortcut: "" },
    { id: "activity", label: "View Activity log", shortcut: "" },
    { id: "undo", label: "Undo last action", shortcut: "Ctrl+Z" },
    { id: "redo", label: "Redo last action", shortcut: "Ctrl+Shift+Z" },
  ];

  const filtered = [
    ...commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    ...tasks
      .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10)
      .map((t) => ({ id: `task:${t.id}`, label: t.title, shortcut: t.status })),
  ];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item) {
          if (item.id.startsWith("task:")) {
            onTaskSelect(Number(item.id.split(":")[1]));
          } else {
            onSelect(item.id);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, selectedIndex, onClose, onSelect, onTaskSelect]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or search tasks..."
          className="w-full px-4 py-3 text-sm border-b outline-none"
          style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--fg)" }}
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id.startsWith("task:")) {
                  onTaskSelect(Number(item.id.split(":")[1]));
                } else {
                  onSelect(item.id);
                }
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                i === selectedIndex ? "font-medium" : ""
              }`}
              style={{
                background: i === selectedIndex ? "var(--accent)" : "transparent",
                color: i === selectedIndex ? "white" : "var(--fg)",
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="text-xs opacity-60">{item.shortcut}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              No results found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Statistics View Component ─────────────────────────────────────────────────

interface StatsViewProps {
  stats: {
    total: number;
    completed: number;
    overdue: number;
    inProgress: number;
    byTopic: { topic: string; count: number; completed: number }[];
    recentActivity: { day: string; count: number }[];
  };
  activityFeed: ActivityEntry[];
}

function StatsView({ stats, activityFeed }: StatsViewProps) {
  // Calculate streaks from completion events
  const completions = activityFeed
    .filter((e) => e.action === "updated" && e.field === "status" && e.new_value === "Complete")
    .map((e) => e.created_at.split("T")[0]);
  const uniqueDays = Array.from(new Set(completions)).sort().reverse();

  let currentStreak = 0;
  let longestStreak = 0;
  if (uniqueDays.length > 0) {
    const today = new Date().toISOString().split("T")[0];
    let streak = 0;
    let prev: Date | null = null;
    for (const d of uniqueDays) {
      const date = new Date(d + "T00:00:00");
      if (prev === null) {
        const diff = Math.round((new Date(today + "T00:00:00").getTime() - date.getTime()) / 86400000);
        if (diff <= 1) streak = 1;
        else break;
      } else {
        const diff = Math.round((prev.getTime() - date.getTime()) / 86400000);
        if (diff === 1) streak++;
        else break;
      }
      prev = date;
    }
    currentStreak = streak;
    // Longest streak from sorted days
    let ls = 1;
    for (let i = 1; i < uniqueDays.length; i++) {
      const d1 = new Date(uniqueDays[i - 1] + "T00:00:00");
      const d2 = new Date(uniqueDays[i] + "T00:00:00");
      if (Math.round((d1.getTime() - d2.getTime()) / 86400000) === 1) ls++;
      else { longestStreak = Math.max(longestStreak, ls); ls = 1; }
    }
    longestStreak = Math.max(longestStreak, ls, currentStreak);
  }

  // Heatmap data (last 30 days)
  const heatmapDays: { day: string; count: number; label: string }[] = [];
  const activityByDay = new Map(stats.recentActivity.map((r) => [r.day, r.count]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const count = activityByDay.get(key) ?? 0;
    heatmapDays.push({ day: key, count, label: d.toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) });
  }
  const maxActivity = Math.max(...heatmapDays.map((d) => d.count), 1);

  // Bar chart (last 14 days)
  const chartDays = heatmapDays.slice(-14);
  const maxChart = Math.max(...chartDays.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Statistics</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "var(--fg)" },
          { label: "Completed", value: stats.completed, color: "var(--success, #10b981)" },
          { label: "In Progress", value: stats.inProgress, color: "var(--accent, #6366f1)" },
          { label: "Overdue", value: stats.overdue, color: "var(--overdue, #ef4444)" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg p-4 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Streaks */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="text-sm font-semibold mb-1">Current Streak</div>
          <div className="text-3xl font-bold" style={{ color: "var(--accent)" }}>{currentStreak} <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>days</span></div>
        </div>
        <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="text-sm font-semibold mb-1">Longest Streak</div>
          <div className="text-3xl font-bold" style={{ color: "var(--success, #10b981)" }}>{longestStreak} <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>days</span></div>
        </div>
      </div>

      {/* Activity bar chart (14 days) */}
      <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm mb-3">Activity (last 14 days)</h3>
        <div className="flex items-end gap-1 h-24">
          {chartDays.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(d.count / maxChart) * 100}%`,
                  minHeight: d.count > 0 ? "4px" : "0",
                  background: "var(--accent)",
                  opacity: 0.8,
                }}
                title={`${d.label}: ${d.count} actions`}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {chartDays.map((d) => (
            <div key={d.day} className="flex-1 text-center" style={{ color: "var(--muted)", fontSize: "9px" }}>
              {new Date(d.day + "T00:00:00").getDate()}
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap (30 days) */}
      <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm mb-3">Activity Heatmap (30 days)</h3>
        <div className="flex flex-wrap gap-1">
          {heatmapDays.map((d) => (
            <div
              key={d.day}
              className="w-6 h-6 rounded flex items-center justify-center"
              style={{
                background: d.count === 0 ? "var(--bg)" : `rgba(99, 102, 241, ${Math.max(0.15, d.count / maxActivity)})`,
                color: d.count > 0 ? "white" : "var(--muted)",
                border: "1px solid var(--border)",
                fontSize: "10px",
              }}
              title={`${d.label}: ${d.count} actions`}
            >
              {d.count > 0 ? d.count : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Topic breakdown */}
      {stats.byTopic.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-3">By Topic</h3>
          <div className="space-y-2">
            {stats.byTopic.map((t) => {
              const pct = t.count > 0 ? Math.round((t.completed / t.count) * 100) : 0;
              return (
                <div key={t.topic} className="flex items-center gap-3 text-sm">
                  <span className="w-28 truncate font-medium">{t.topic}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--success, #10b981)" }} />
                  </div>
                  <span className="text-xs w-20 text-right" style={{ color: "var(--muted)" }}>{t.completed}/{t.count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.total === 0 && (
        <div className="text-center py-8 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="font-medium">No data yet</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Create and complete tasks to see statistics.</p>
        </div>
      )}
    </div>
  );
}
