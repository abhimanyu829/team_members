import { useState, useEffect } from "react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { FolderKanban, CheckCircle2, Clock, AlertCircle, CalendarDays, Sparkles, Building2, ArrowUpRight } from "lucide-react";

const STATUS_COLORS = {
  todo: "bg-zinc-100 text-zinc-600 border-zinc-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  review: "bg-purple-50 text-purple-700 border-purple-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
};

const PRIORITY_DOT = { critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-green-400" };

export default function WorkerDashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get("/api/analytics/kpis"),
      api.get(`/api/tasks?assignee_id=${user.user_id}`),
      api.get("/api/meetings"),
    ]).then(([kpisRes, tasksRes, meetingsRes]) => {
      setKpis(kpisRes.data);
      setTasks(tasksRes.data);
      const upcoming = meetingsRes.data.filter((m) =>
        m.attendee_ids?.includes(user.user_id) || m.organizer_id === user.user_id
      );
      setMeetings(upcoming.slice(0, 3));
    }).catch(() => {});
  }, [user]);

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");

  const kpiCards = [
    { label: "Assigned", value: tasks.length, icon: FolderKanban, color: "bg-indigo-50 text-indigo-600" },
    { label: "In Progress", value: inProgressTasks.length, icon: Clock, color: "bg-blue-50 text-blue-600" },
    { label: "Completed", value: doneTasks.length, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
    { label: "Blocked", value: blockedTasks.length, icon: AlertCircle, color: "bg-red-50 text-red-600" },
  ];

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">Here's your workspace overview</p>
      </div>

      {/* Team Communication */}
      <a href="/chat" className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm hover:shadow-md transition-all group">
         <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                <Building2 className="w-6 h-6" />
            </div>
            <div>
                <h3 className="text-sm font-bold text-zinc-900">Communication Hub</h3>
                <p className="text-xs text-zinc-500">Reach out to your department lead or HOD instantly.</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-zinc-200" />
                ))}
            </div>
            <ArrowUpRight className="w-4 h-4 text-zinc-300 group-hover:text-indigo-600 transition-colors" />
         </div>
      </a>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} data-testid={`worker-kpi-${label.replace(/\s/g, "-").toLowerCase()}`}
            className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
            <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Mini Kanban */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>My Tasks</h3>
          <a href="/tasks" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View all →</a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { status: "todo", label: "To Do", taskList: todoTasks, dot: "bg-zinc-400" },
            { status: "in_progress", label: "In Progress", taskList: inProgressTasks, dot: "bg-indigo-500" },
            { status: "done", label: "Done", taskList: doneTasks, dot: "bg-emerald-500" },
          ].map(({ status, label, taskList, dot }) => (
            <div key={status} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">{label}</span>
                <span className="ml-auto text-xs text-zinc-400 bg-zinc-200 px-1.5 py-0.5 rounded-full">{taskList.length}</span>
              </div>
              <div className="space-y-2">
                {taskList.slice(0, 4).map((task) => (
                  <div key={task.task_id} className="bg-white rounded-lg p-2.5 border border-zinc-200 shadow-sm">
                    <p className="text-xs font-medium text-zinc-900 line-clamp-2">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                      <span className="text-[10px] text-zinc-400">{task.priority}</span>
                      {task.due_date && (
                        <span className="text-[10px] text-zinc-400 ml-auto">
                          {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {taskList.length === 0 && (
                  <p className="text-xs text-zinc-400 text-center py-2">No tasks</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meetings + AI Prompt */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Meetings */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              Upcoming Meetings
            </h3>
            <CalendarDays className="w-4 h-4 text-zinc-400" />
          </div>
          {meetings.length === 0 ? (
            <div className="text-center py-6 text-zinc-400">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No upcoming meetings</p>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => (
                <div key={m.meeting_id} className="flex items-start gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 rounded-lg flex flex-col items-center justify-center text-white">
                    <span className="text-[10px] font-semibold leading-none">
                      {new Date(m.start_time).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                    </span>
                    <span className="text-lg font-bold leading-none">
                      {new Date(m.start_time).getDate()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">{m.title}</p>
                    <p className="text-xs text-indigo-600">
                      {new Date(m.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} –{" "}
                      {new Date(m.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Copilot Quick Access */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-6 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5" />
            <h3 className="text-base font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>AI Copilot</h3>
          </div>
          <p className="text-sm text-indigo-100 mb-4">
            Get AI-powered insights about your tasks, deadlines, and productivity.
          </p>
          <div className="space-y-2">
            {["What should I work on today?", "Summarize my blocked tasks", "Help me write a task description"].map((prompt) => (
              <div key={prompt} className="bg-white/10 rounded-lg px-3 py-2 text-xs text-indigo-100 hover:bg-white/20 cursor-pointer transition-colors">
                {prompt}
              </div>
            ))}
          </div>
          <p className="text-xs text-indigo-200 mt-3">Click "AI Copilot" in the header to start chatting</p>
        </div>
      </div>
    </div>
  );
}
