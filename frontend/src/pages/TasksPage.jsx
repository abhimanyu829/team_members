import { useState, useEffect } from "react";
import api, { formatError } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, X, MessageCircle, Loader2, Search, ChevronDown } from "lucide-react";

const COLUMNS = [
  { id: "todo", label: "To Do", color: "bg-zinc-100", dot: "bg-zinc-400", textColor: "text-zinc-700" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-50", dot: "bg-blue-500", textColor: "text-blue-700" },
  { id: "review", label: "In Review", color: "bg-purple-50", dot: "bg-purple-500", textColor: "text-purple-700" },
  { id: "done", label: "Done", color: "bg-emerald-50", dot: "bg-emerald-500", textColor: "text-emerald-700" },
  { id: "blocked", label: "Blocked", color: "bg-red-50", dot: "bg-red-500", textColor: "text-red-700" },
];

const PRIORITY_STYLE = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [users, setUsers] = useState([]);
  const [dragOver, setDragOver] = useState(null);
  const [newTask, setNewTask] = useState({
    title: "", description: "", priority: "medium", status: "todo",
    assignee_id: "", sprint: "Sprint 2", due_date: "", tags: ""
  });

  useEffect(() => {
    Promise.all([api.get("/api/tasks"), api.get("/api/users")])
      .then(([tasksRes, usersRes]) => {
        setTasks(tasksRes.data);
        setUsers(usersRes.data.filter((u) => u.role === "worker" || u.role === "hod"));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredTasks = tasks.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDrop = async (e, status) => {
    e.preventDefault();
    setDragOver(null);
    const taskId = e.dataTransfer.getData("taskId");
    const task = tasks.find((t) => t.task_id === taskId);
    if (!task || task.status === status) return;
    setTasks((prev) => prev.map((t) => t.task_id === taskId ? { ...t, status } : t));
    try {
      await api.put(`/api/tasks/${taskId}`, { status });
    } catch {
      // Revert on error
      setTasks((prev) => prev.map((t) => t.task_id === taskId ? { ...t, status: task.status } : t));
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      const tags = newTask.tags ? newTask.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
      const { data } = await api.post("/api/tasks", { ...newTask, tags });
      setTasks((prev) => [data, ...prev]);
      setShowCreate(false);
      setNewTask({ title: "", description: "", priority: "medium", status: "todo", assignee_id: "", sprint: "Sprint 2", due_date: "", tags: "" });
    } catch {}
  };

  const handleDeleteTask = async (taskId) => {
    await api.delete(`/api/tasks/${taskId}`).catch(() => {});
    setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    if (selectedTask?.task_id === taskId) setSelectedTask(null);
  };

  const handleUpdateStatus = async (taskId, newStatus) => {
    const oldStatus = selectedTask?.status;
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.task_id === taskId ? { ...t, status: newStatus } : t));
    if (selectedTask?.task_id === taskId) {
      setSelectedTask((prev) => ({ ...prev, status: newStatus }));
    }
    try {
      await api.put(`/api/tasks/${taskId}`, { status: newStatus });
    } catch {
      // Revert on error
      setTasks((prev) => prev.map((t) => t.task_id === taskId ? { ...t, status: oldStatus } : t));
      if (selectedTask?.task_id === taskId) {
        setSelectedTask((prev) => ({ ...prev, status: oldStatus }));
      }
    }
  };

  const openTask = async (task) => {
    setSelectedTask(task);
    const { data } = await api.get(`/api/tasks/${task.task_id}/comments`).catch(() => ({ data: [] }));
    setComments(data);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const { data } = await api.post(`/api/tasks/${selectedTask.task_id}/comments`, { content: newComment });
    setComments((c) => [...c, data]);
    setNewComment("");
  };

  const visibleUsers = user?.role === "worker"
    ? users.filter((u) => u.department_id === user.department_id)
    : users;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>
            Task Board
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{tasks.length} tasks across {COLUMNS.length} stages</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              data-testid="task-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-9 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
          </div>
          <button
            data-testid="kanban-create-task-button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(({ id, label, color, dot, textColor }) => {
            const colTasks = filteredTasks.filter((t) => t.status === id);
            return (
              <div
                key={id}
                data-testid={`kanban-column-${id}`}
                className={`flex flex-col w-64 rounded-xl ${dragOver === id ? "ring-2 ring-indigo-400" : ""} transition-all`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, id)}
              >
                {/* Column Header */}
                <div className={`${color} rounded-t-xl px-3 py-2.5 flex items-center gap-2 border border-zinc-200 border-b-0`}>
                  <div className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${textColor}`}>{label}</span>
                  <span className="ml-auto text-xs font-bold text-zinc-400 bg-white/60 px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div className={`flex-1 overflow-y-auto p-2 space-y-2 ${color} border border-zinc-200 border-t-0 rounded-b-xl`}
                  style={{ minHeight: "400px", maxHeight: "calc(100vh - 220px)" }}>
                  {colTasks.map((task) => (
                    <div
                      key={task.task_id}
                      data-testid={`task-card-${task.task_id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.task_id)}
                      onClick={() => openTask(task)}
                      className="bg-white border border-zinc-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-zinc-900 leading-snug line-clamp-2 flex-1">{task.title}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.task_id); }}
                          className="text-zinc-300 hover:text-red-400 flex-shrink-0 transition-colors"
                          data-testid={`delete-task-${task.task_id}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[task.priority]}`}>
                          {task.priority}
                        </span>
                        {task.sprint && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">{task.sprint}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1">
                          {task.assignee_name && (
                            <div className="w-5 h-5 bg-indigo-200 rounded-full flex items-center justify-center text-[9px] font-bold text-indigo-700">
                              {task.assignee_name[0]}
                            </div>
                          )}
                          {task.due_date && (
                            <span className="text-[10px] text-zinc-400">
                              {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-6 text-zinc-400">
                      <p className="text-xs">Drop tasks here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-end p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedTask(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md h-full overflow-y-auto shadow-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-semibold px-2 py-1 rounded border ${PRIORITY_STYLE[selectedTask.priority]}`}>
                {selectedTask.priority}
              </span>
              <button onClick={() => setSelectedTask(null)} className="p-1 rounded-lg hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <h2 className="text-lg font-semibold text-zinc-950 mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              {selectedTask.title}
            </h2>
            {selectedTask.description && (
              <p className="text-sm text-zinc-500 mb-4">{selectedTask.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Assignee</p>
                <p className="text-zinc-700">{selectedTask.assignee_name || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Sprint</p>
                <p className="text-zinc-700">{selectedTask.sprint || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Due Date</p>
                <p className="text-zinc-700">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Status</p>
                <select
                  value={selectedTask.status}
                  onChange={(e) => handleUpdateStatus(selectedTask.task_id, e.target.value)}
                  className="w-full border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comments */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="w-4 h-4 text-zinc-400" />
                <p className="text-sm font-semibold text-zinc-700">Comments ({comments.length})</p>
              </div>
              <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.comment_id} className="bg-zinc-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 bg-indigo-200 rounded-full flex items-center justify-center text-[9px] font-bold text-indigo-700">
                        {c.user_name[0]}
                      </div>
                      <span className="text-xs font-medium text-zinc-700">{c.user_name}</span>
                      <span className="text-[10px] text-zinc-400 ml-auto">
                        {new Date(c.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 ml-7">{c.content}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-xs text-zinc-400 text-center py-2">No comments yet</p>}
              </div>
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  data-testid="comment-input"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 text-xs border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button data-testid="comment-submit" type="submit"
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 transition-all">
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Create New Task</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-zinc-100"><X className="w-4 h-4 text-zinc-400" /></button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Title *</label>
                <input required data-testid="create-task-title"
                  value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="What needs to be done?"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  rows={2} placeholder="Add details..."
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={newTask.status} onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">In Review</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Assignee</label>
                  <select value={newTask.assignee_id} onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Unassigned</option>
                    {visibleUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Due Date</label>
                  <input type="date" value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Sprint</label>
                <input value={newTask.sprint} onChange={(e) => setNewTask({ ...newTask, sprint: e.target.value })}
                  placeholder="Sprint 2"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 border border-zinc-200 text-zinc-700 rounded-lg py-2 text-sm hover:bg-zinc-50 transition-all">Cancel</button>
                <button data-testid="submit-create-task" type="submit"
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 transition-all">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
