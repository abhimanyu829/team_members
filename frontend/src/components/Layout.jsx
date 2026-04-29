import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import AICopilot from "@/components/AICopilot";
import NotificationsPanel from "@/components/NotificationsPanel";
import api from "@/utils/api";
import { Bell, Sparkles } from "lucide-react";

export default function Layout({ children, fullBleed = false }) {
  const { user, getWS } = useAuth();
  const [showAI, setShowAI] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const ws = getWS();
    if (!ws) return;
    const handler = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification_new") {
          setNotifCount((c) => c + 1);
        }
      } catch {}
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [getWS]);

  async function fetchUnreadCount() {
    try {
      const { data } = await api.get("/api/notifications");
      setNotifCount(data.filter((n) => !n.is_read).length);
    } catch {}
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 z-30 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-zinc-200 h-14 flex items-center justify-between px-4 lg:px-6 z-10">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-zinc-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
              data-testid="mobile-menu-button"
              aria-label="Open menu"
            >
              <div className="w-5 h-0.5 bg-zinc-600 mb-1" />
              <div className="w-5 h-0.5 bg-zinc-600 mb-1" />
              <div className="w-4 h-0.5 bg-zinc-600" />
            </button>
            <div>
              <p className="text-xs text-zinc-400">
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Copilot button */}
            <button
              data-testid="ai-copilot-toggle"
              onClick={() => setShowAI(!showAI)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showAI ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Copilot
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                data-testid="notifications-button"
                onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) fetchUnreadCount(); }}
                className="relative p-2 rounded-lg hover:bg-zinc-100 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-zinc-600" />
                {notifCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-10 z-50 w-80">
                  <NotificationsPanel onClose={() => setShowNotifs(false)} onRead={() => setNotifCount(0)} />
                </div>
              )}
            </div>

            {/* User avatar */}
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
                {user?.picture ? (
                  <img src={user.picture.startsWith('http') ? user.picture : `/api/files/${user.picture}/download`} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.name?.[0]?.toUpperCase() || "U"
                )}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold text-zinc-900">{user?.name}</p>
                <p className="text-[10px] text-zinc-400 capitalize">
                  {user?.role === "super_admin" ? "Supersenior" : user?.role === "hod" ? "Subsenior of Branch" : "Junior"}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content + AI Panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className={`flex-1 ${fullBleed ? "overflow-hidden" : "overflow-y-auto p-4 lg:p-6"}`}>
            {children}
          </main>
          {showAI && (
            <div className="w-80 flex-shrink-0 border-l border-zinc-200 bg-white overflow-hidden">
              <AICopilot onClose={() => setShowAI(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
