import { useState, useEffect, useCallback } from "react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import CreateUserModal from "@/components/CreateUserModal";
import CreateDepartmentModal from "@/components/CreateDepartmentModal";
import UserProfileDrawer from "@/components/UserProfileDrawer";
import {
  Search, Plus, Users, MoreVertical, Eye, Shield,
  ArrowLeftRight, Loader2, Building2, Trash2
} from "lucide-react";

const ROLE_BADGE = {
  super_admin: "bg-indigo-100 text-indigo-700",
  hod: "bg-emerald-100 text-emerald-700",
  worker: "bg-zinc-100 text-zinc-600",
};
const ROLE_LABEL = { super_admin: "Supersenior", hod: "Subsenior of Branch", worker: "Junior" };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [departments, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, deptsRes] = await Promise.all([
        api.get("/api/users"),
        api.get("/api/departments"),
      ]);
      setUsers(usersRes.data);
      setDepts(deptsRes.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = users.filter((u) => {
    const matchSearch = !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchDept = deptFilter === "all" || u.department_id === deptFilter;
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "active" ? u.is_active !== false : u.is_active === false);
    // HOD sees only their dept users
    const matchAccess = currentUser?.role === "super_admin" || u.department_id === currentUser?.department_id;
    return matchSearch && matchRole && matchDept && matchStatus && matchAccess;
  });

  const getDeptName = (deptId) => departments.find((d) => d.department_id === deptId)?.name || "—";

  const roleTabs = [
    { id: "all", label: "All Members", count: filtered.length },
    ...(currentUser?.role === "super_admin" ? [{ id: "super_admin", label: "Supersenior" }] : []),
    { id: "hod", label: "Subseniors of Branch" },
    { id: "worker", label: "Juniors" },
  ];

  const handleSuspend = async (userId, isActive) => {
    await api.put(`/api/users/${userId}/suspend`).catch(() => {});
    setUsers((u) => u.map((x) => x.user_id === userId ? { ...x, is_active: !x.is_active } : x));
    setOpenMenu(null);
  };

  const handleDelete = async (userId, userName) => {
    setOpenMenu(null);
    if (!window.confirm(`Are you sure you want to permanently delete "${userName}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/api/users/${userId}`);
      setUsers((u) => u.filter((x) => x.user_id !== userId));
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to delete user.");
    }
  };

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>
            Team Members
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        {currentUser?.role !== "worker" && (
          <div className="flex items-center gap-2">
            {currentUser?.role === "super_admin" && (
              <button data-testid="create-department-button" onClick={() => setShowCreateDept(true)}
                className="flex items-center gap-2 bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-semibold transition-all">
                <Building2 className="w-4 h-4" /> New Department
              </button>
            )}
            <button data-testid="create-user-button" onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
              <Plus className="w-4 h-4" /> Add Member
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input data-testid="user-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, username..."
              className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {/* Department filter */}
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-36">
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
          </select>
          {/* Status filter */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {/* Role tabs */}
        <div className="flex gap-1 mt-3 bg-zinc-50 rounded-lg p-1">
          {roleTabs.map(({ id, label, count }) => (
            <button key={id} data-testid={`role-filter-${id}`} onClick={() => setRoleFilter(id)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${roleFilter === id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-zinc-50 border-b border-zinc-100 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider rounded-t-xl">
            <span className="col-span-4">Member</span>
            <span className="col-span-2">Role</span>
            <span className="col-span-2">Department</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-2 text-right">Actions</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
              <Users className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No members found</p>
              {search && <p className="text-xs mt-1">Try adjusting your search or filters</p>}
            </div>
          ) : (
            filtered.map((u) => (
              <div key={u.user_id} data-testid={`user-row-${u.user_id}`}
                className="grid grid-cols-6 md:grid-cols-12 gap-4 px-5 py-4 border-b border-zinc-50 hover:bg-zinc-50/50 items-center transition-colors last:border-b-0 last:rounded-b-xl">
                {/* Member */}
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {u.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{u.name}</p>
                    <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                    {u.username && <p className="text-[10px] text-zinc-300 font-mono">{u.username}</p>}
                  </div>
                </div>
                {/* Role */}
                <div className="col-span-2 hidden md:block">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role]}`}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </div>
                {/* Department */}
                <div className="col-span-2 hidden md:block">
                  <p className="text-xs text-zinc-600">{getDeptName(u.department_id)}</p>
                  {u.professional_title && <p className="text-[10px] text-zinc-400 truncate">{u.professional_title}</p>}
                </div>
                {/* Status */}
                <div className="col-span-2 hidden md:block">
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${u.is_active !== false ? "text-emerald-600" : "text-red-500"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${u.is_active !== false ? "bg-emerald-500" : "bg-red-400"}`} />
                    {u.is_active !== false ? "Active" : "Suspended"}
                  </span>
                </div>
                {/* Actions */}
                <div className="col-span-2 md:col-span-2 flex items-center justify-end gap-2">
                  <button data-testid={`view-profile-${u.user_id}`} onClick={() => setSelectedUserId(u.user_id)}
                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-zinc-400 hover:text-indigo-600 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  {(currentUser?.role === "super_admin" || (currentUser?.role === "hod" && u.department_id === currentUser?.department_id)) && u.user_id !== currentUser?.user_id && (
                    <div className="relative">
                      <button data-testid={`user-menu-${u.user_id}`} onClick={() => setOpenMenu(openMenu === u.user_id ? null : u.user_id)}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenu === u.user_id && (
                        <div className="absolute right-0 top-8 bg-white border border-zinc-200 rounded-xl shadow-lg z-30 w-44 overflow-hidden">
                          <button onClick={() => { setSelectedUserId(u.user_id); setOpenMenu(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors">
                            <Eye className="w-3.5 h-3.5 text-zinc-400" /> View Profile
                          </button>
                          <button onClick={() => { handleSuspend(u.user_id, u.is_active); }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors ${u.is_active !== false ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}>
                            <Shield className="w-3.5 h-3.5" />
                            {u.is_active !== false ? "Suspend" : "Activate"}
                          </button>
                          {currentUser?.role === "super_admin" && (
                            <button onClick={() => { setSelectedUserId(u.user_id); setOpenMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-purple-700 hover:bg-purple-50 transition-colors">
                              <ArrowLeftRight className="w-3.5 h-3.5" /> Transfer Dept
                            </button>
                          )}
                          {currentUser?.role === "super_admin" && (
                            <>
                              <div className="border-t border-zinc-100 my-1" />
                              <button
                                data-testid={`delete-user-${u.user_id}`}
                                onClick={() => handleDelete(u.user_id, u.name)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors font-semibold"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete User
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateDept && (
        <CreateDepartmentModal
          onClose={() => { setShowCreateDept(false); fetchData(); }}
          onSuccess={() => { fetchData(); }}
        />
      )}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          departments={departments}
          users={users}
          defaultRole={currentUser?.role === "hod" ? "worker" : undefined}
          lockDept={currentUser?.role === "hod" ? currentUser?.department_id : undefined}
          onSuccess={(newUser) => { setUsers((u) => [newUser, ...u]); setShowCreate(false); }}
        />
      )}
      {selectedUserId && (
        <UserProfileDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUpdate={fetchData}
        />
      )}

      {/* Close menu on outside click */}
      {openMenu && <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />}
    </div>
  );
}
