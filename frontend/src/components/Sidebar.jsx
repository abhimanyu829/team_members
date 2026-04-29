import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, FolderKanban, BarChart3, Calendar,
  FolderOpen, Settings, LogOut, Building2, Briefcase
} from "lucide-react";

const roleNavItems = {
  super_admin: [
    { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/war-room", icon: Briefcase, label: "Ideation Point" },
    { to: "/boardroom", icon: BarChart3, label: "Control Room" },
    { to: "/chat", icon: Building2, label: "Messages" },
    { to: "/users", icon: Users, label: "Team Members" },
    { to: "/tasks", icon: FolderKanban, label: "All Tasks" },
    { to: "/meetings", icon: Calendar, label: "Meetings" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ],
  hod: [
    { to: "/hod", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/war-room", icon: Briefcase, label: "Ideation Point" },
    { to: "/boardroom", icon: BarChart3, label: "Control Room" },
    { to: "/chat", icon: Building2, label: "Communications" },
    { to: "/users", icon: Users, label: "Team Members" },
    { to: "/tasks", icon: FolderKanban, label: "Tasks" },
    { to: "/meetings", icon: Calendar, label: "Meetings" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ],
  worker: [
    { to: "/worker", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/boardroom", icon: BarChart3, label: "Control Room" },
    { to: "/chat", icon: Building2, label: "Team Chat" },
    { to: "/tasks", icon: FolderKanban, label: "My Tasks" },
    { to: "/meetings", icon: Calendar, label: "Meetings" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ],
};

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = roleNavItems[user?.role] || roleNavItems.worker;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const roleBadge = {
    super_admin: { label: "Supersenior", color: "bg-indigo-100 text-indigo-700" },
    hod: { label: "Subsenior of Branch", color: "bg-emerald-100 text-emerald-700" },
    worker: { label: "Junior", color: "bg-zinc-100 text-zinc-600" },
  };
  const badge = roleBadge[user?.role] || roleBadge.worker;

  return (
    <div className="w-56 h-full bg-white border-r border-zinc-200 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-zinc-200 flex-shrink-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-semibold text-zinc-900 text-sm leading-tight">Takshak</p>
          <p className="text-[10px] text-zinc-400 leading-tight">Enterprise</p>
        </div>
        <button className="ml-auto lg:hidden p-1 text-zinc-400 hover:text-zinc-600" onClick={onClose} aria-label="Close menu">✕</button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Navigation</p>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-indigo-600" : "text-zinc-400"}`} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-zinc-200 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 truncate">{user?.name}</p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.color}`}>
              {badge.label}
            </span>
          </div>
        </div>
        <button
          data-testid="logout-button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-red-600 rounded-lg transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
