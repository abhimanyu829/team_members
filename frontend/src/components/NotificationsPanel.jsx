import { useEffect, useState } from "react";
import api from "@/utils/api";
import { Bell, Check, X } from "lucide-react";

const typeColors = {
  task_assigned: "bg-indigo-50 text-indigo-600",
  meeting_invite: "bg-emerald-50 text-emerald-600",
  task_updated: "bg-amber-50 text-amber-600",
  default: "bg-zinc-50 text-zinc-600",
};

export default function NotificationsPanel({ onClose, onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/notifications")
      .then(({ data }) => setNotifications(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id) => {
    await api.put(`/api/notifications/${id}/read`).catch(() => {});
    setNotifications((n) => n.map((x) => x.notification_id === id ? { ...x, is_read: true } : x));
    onRead?.();
  };

  const markAllRead = async () => {
    await api.put("/api/notifications/read-all").catch(() => {});
    setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
    onRead?.();
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-zinc-600" />
          <span className="font-semibold text-zinc-900 text-sm">Notifications</span>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button
              data-testid="mark-all-read-button"
              onClick={markAllRead}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
            >
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 transition-colors">
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
            <Bell className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.notification_id}
              data-testid={`notification-${n.notification_id}`}
              className={`flex gap-3 px-4 py-3 border-b border-zinc-50 transition-colors ${!n.is_read ? "bg-indigo-50/40" : "hover:bg-zinc-50"}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${typeColors[n.type] || typeColors.default}`}>
                {n.type === "task_assigned" ? "T" : n.type === "meeting_invite" ? "M" : "N"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => markRead(n.notification_id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-indigo-100 text-indigo-500 transition-colors"
                  title="Mark as read"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
