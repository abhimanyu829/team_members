import { useState, useEffect } from "react";
import api from "@/utils/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Users, FolderKanban, CheckCircle2, AlertCircle, TrendingUp, Building2, Clock, BarChart3, Briefcase, ArrowUpRight } from "lucide-react";

const STATUS_COLORS = {
  todo: "#E4E4E7",
  in_progress: "#6366F1",
  review: "#A855F7",
  done: "#10B981",
  blocked: "#EF4444",
};

const PRIORITY_COLORS = { critical: "text-red-600", high: "text-orange-500", medium: "text-yellow-600", low: "text-green-600" };

export default function AdminDashboard() {
  const [kpis, setKpis] = useState(null);
  const [deptData, setDeptData] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [statusData, setStatusData] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/api/analytics/kpis"),
      api.get("/api/analytics/department-comparison"),
      api.get("/api/users"),
      api.get("/api/tasks"),
      api.get("/api/analytics/tasks-by-status"),
    ]).then(([kpisRes, deptRes, usersRes, tasksRes, statusRes]) => {
      setKpis(kpisRes.data);
      setDeptData(deptRes.data);
      setUsers(usersRes.data);
      setTasks(tasksRes.data.slice(0, 6));
      setStatusData(statusRes.data);
    }).catch(() => { });
  }, []);

  const kpiCards = kpis ? [
    { label: "Total Users", value: kpis.total_users, icon: Users, color: "bg-indigo-50 text-indigo-600", change: "+3 this week" },
    { label: "Total Tasks", value: kpis.total_tasks, icon: FolderKanban, color: "bg-purple-50 text-purple-600", change: `${kpis.completion_rate}% complete` },
    { label: "Completed", value: kpis.completed, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600", change: "All time" },
    { label: "Overdue", value: kpis.overdue, icon: AlertCircle, color: "bg-red-50 text-red-600", change: "Need attention" },
    { label: "In Progress", value: kpis.in_progress, icon: TrendingUp, color: "bg-blue-50 text-blue-600", change: "Active now" },
    { label: "Departments", value: kpis.total_departments, icon: Building2, color: "bg-amber-50 text-amber-600", change: "Across org" },
  ] : [];

  const hods = users.filter((u) => u.role === "hod");
  const workers = users.filter((u) => u.role === "worker");

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>
          Organization Overview
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">Platform health at a glance</p>
      </div>

      {/* Enterprise Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/boardroom" className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl shadow-zinc-200/50 hover:scale-[1.01] transition-all">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white mb-4 group-hover:bg-indigo-600 transition-colors">
              <BarChart3 className="w-6 h-6" />
            </div>
            <ArrowUpRight className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Executive Boardroom</h3>
          <p className="text-xs text-zinc-400">Monitor MRR, Burn Rate, and Financial KPIs across all departments.</p>
        </a>
        <a href="/war-room" className="group bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Briefcase className="w-6 h-6" />
            </div>
            <ArrowUpRight className="w-5 h-5 text-zinc-300 group-hover:text-indigo-600 transition-colors" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Ideation Point</h3>
          <p className="text-xs text-zinc-500">Capture raw ideas, validate system architecture, and plan roadmaps.</p>
        </a>
      </div>

      {/* KPI Cards */}
      {!kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-zinc-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-zinc-100 rounded w-3/4 mb-2" />
              <div className="h-8 bg-zinc-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpiCards.map(({ label, value, icon: Icon, color, change }) => (
            <div key={label} data-testid={`kpi-${label.replace(/\s/g, "-").toLowerCase()}`}
              className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>{value}</p>
              <p className="text-xs font-medium text-zinc-700 mt-0.5">{label}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{change}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts + Org Tree */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Comparison */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Department Performance
          </h3>
          {deptData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-zinc-400 text-sm">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deptData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717A" }} />
                <YAxis tick={{ fontSize: 11, fill: "#71717A" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "white", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="total_tasks" name="Total" fill="#E0E7FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Done" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-indigo-200" />
              <span className="text-xs text-zinc-500">Total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-indigo-600" />
              <span className="text-xs text-zinc-500">Completed</span>
            </div>
          </div>
        </div>

        {/* Task Status Distribution */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Task Status Breakdown
          </h3>
          <div className="space-y-3">
            {statusData.map(({ status, count, label }) => {
              const max = Math.max(...statusData.map((s) => s.count)) || 1;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-600 font-medium">{label}</span>
                    <span className="text-zinc-900 font-semibold">{count}</span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(count / max) * 100}%`, backgroundColor: STATUS_COLORS[status] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Org Hierarchy + Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Org Hierarchy Tree */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Org Hierarchy
          </h3>
          <div className="space-y-3">
            {/* Super Admin */}
            <div className="flex items-center gap-2 p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">SA</div>
              <div>
                <p className="text-sm font-semibold text-indigo-900">Alex Chen</p>
                <p className="text-[10px] text-indigo-500 uppercase tracking-wide">Super Admin</p>
              </div>
            </div>
            {/* HOD Level */}
            <div className="ml-4 space-y-2">
              {hods.map((hod) => {
                const deptWorkers = workers.filter((w) => w.department_id === hod.department_id);
                const deptInfo = deptData.find((d) => d.name === deptWorkers[0]?.name);
                return (
                  <div key={hod.user_id}>
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100 mb-1.5">
                      <div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {hod.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-900">{hod.name}</p>
                        <p className="text-[10px] text-emerald-500 uppercase tracking-wide">HOD</p>
                      </div>
                    </div>
                    {/* Workers under this HOD */}
                    <div className="ml-4 space-y-1.5">
                      {workers.filter((w) => w.department_id === hod.department_id).map((worker) => (
                        <div key={worker.user_id} className="flex items-center gap-2 p-1.5 bg-zinc-50 rounded-lg border border-zinc-100">
                          <div className="w-6 h-6 bg-zinc-300 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {worker.name[0]}
                          </div>
                          <p className="text-xs text-zinc-600">{worker.name}</p>
                          <span className="ml-auto text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">Worker</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Recent Tasks
          </h3>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="text-sm text-zinc-400 text-center py-4">Loading tasks...</div>
            ) : (
              tasks.map((task) => (
                <div key={task.task_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors border border-transparent hover:border-zinc-200">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[task.status] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 font-medium truncate">{task.title}</p>
                    <p className="text-[10px] text-zinc-400">{task.status.replace("_", " ")} · {task.assignee_name || "Unassigned"}</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${PRIORITY_COLORS[task.priority]}`}>
                    {task.priority}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
