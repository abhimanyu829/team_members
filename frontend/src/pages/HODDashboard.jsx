import { useState, useEffect } from "react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FolderKanban, CheckCircle2, Clock, AlertCircle, Users, CalendarDays, Plus, X } from "lucide-react";

const STATUS_COLORS = {
  todo: "bg-zinc-100 text-zinc-600",
  in_progress: "bg-blue-50 text-blue-600",
  review: "bg-purple-50 text-purple-600",
  done: "bg-emerald-50 text-emerald-600",
  blocked: "bg-red-50 text-red-600",
};

const PRIORITY_DOT = { critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-green-400" };

export default function HODDashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", priority: "medium", status: "todo", assignee_id: "", due_date: "" });

  const deptId = user?.department_id;

  useEffect(() => {
    if (!deptId) return;
    Promise.all([
      api.get("/api/analytics/kpis"),
      api.get(`/api/tasks?department_id=${deptId}`),
      api.get("/api/users"),
      api.get("/api/meetings"),
      api.get("/api/analytics/tasks-by-status"),
    ]).then(([kpisRes, tasksRes, usersRes, meetingsRes, statusRes]) => {
      setKpis(kpisRes.data);
      setTasks(tasksRes.data);
      setMembers(usersRes.data.filter((u) => u.department_id === deptId && u.role === "worker"));
      setMeetings(meetingsRes.data.slice(0, 3));
      setStatusData(statusRes.data);
    }).catch(() => {});
  }, [deptId]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/api/tasks", { ...newTask, department_id: deptId });
      setTasks((t) => [data, ...t]);
      setShowCreateTask(false);
      setNewTask({ title: "", priority: "medium", status: "todo", assignee_id: "", due_date: "" });
    } catch {}
  };

  const memberStats = members.map((m) => ({
    ...m,
    task_count: tasks.filter((t) => t.assignee_id === m.user_id).length,
    done_count: tasks.filter((t) => t.assignee_id === m.user_id && t.status === "done").length,
  }));

  const kpiCards = kpis ? [
    { label: "Total Tasks", value: kpis.total_tasks, icon: FolderKanban, color: "bg-indigo-50 text-indigo-600" },
    { label: "In Progress", value: kpis.in_progress, icon: Clock, color: "bg-blue-50 text-blue-600" },
    { label: "Completed", value: kpis.completed, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
    { label: "Blocked", value: kpis.blocked, icon: AlertCircle, color: "bg-red-50 text-red-600" },
  ] : [];

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>
            Department Dashboard
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {user?.department_name || "Your department"} · {members.length} members
          </p>
        </div>
        <button
          data-testid="create-task-button"
          onClick={() => setShowCreateTask(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} data-testid={`hod-kpi-${label.replace(/\s/g, "-").toLowerCase()}`}
            className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
            <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>{value ?? "—"}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Task Chart + Team Members */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Chart */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Task Distribution
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={statusData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717A" }} />
              <YAxis tick={{ fontSize: 10, fill: "#71717A" }} />
              <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="count" name="Tasks" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Team Members */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              Team Members
            </h3>
            <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full">{members.length} members</span>
          </div>
          <div className="space-y-3">
            {memberStats.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">No members yet</p>
            ) : (
              memberStats.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 transition-colors">
                  <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {m.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{m.name}</p>
                    <p className="text-xs text-zinc-400">{m.task_count} tasks · {m.done_count} done</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600">
                      {m.task_count > 0 ? Math.round((m.done_count / m.task_count) * 100) : 0}%
                    </p>
                    <p className="text-[10px] text-zinc-400">complete</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Tasks + Upcoming Meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Recent Tasks
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tasks.slice(0, 8).map((task) => (
              <div key={task.task_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-all">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-900 font-medium truncate">{task.title}</p>
                  <p className="text-[10px] text-zinc-400">{task.assignee_name || "Unassigned"}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>
                  {task.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              Upcoming Meetings
            </h3>
            <CalendarDays className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="space-y-3">
            {meetings.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">No meetings scheduled</p>
            ) : (
              meetings.map((m) => (
                <div key={m.meeting_id} className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-sm font-semibold text-indigo-900">{m.title}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">
                    {new Date(m.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-indigo-500 mt-1">{m.attendee_ids?.length || 0} attendees</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Create Task</h3>
              <button onClick={() => setShowCreateTask(false)} className="p-1 rounded-lg hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Title</label>
                <input
                  data-testid="task-title-input"
                  required value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Task title..."
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select
                    data-testid="task-priority-select"
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Assignee</label>
                  <select
                    data-testid="task-assignee-select"
                    value={newTask.assignee_id}
                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateTask(false)}
                  className="flex-1 border border-zinc-200 text-zinc-700 rounded-lg py-2 text-sm font-medium hover:bg-zinc-50 transition-all">
                  Cancel
                </button>
                <button data-testid="task-submit-button" type="submit"
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 transition-all">
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
