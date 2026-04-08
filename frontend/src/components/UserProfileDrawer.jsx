import { useState, useEffect } from "react";
import api, { formatError } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  X, Linkedin, Github, Globe, Phone, MapPin, Briefcase, Calendar,
  Mail, User, Shield, AlertCircle, RefreshCw, ArrowLeftRight, Loader2
} from "lucide-react";

const ROLE_BADGE = {
  super_admin: "bg-indigo-100 text-indigo-700 border-indigo-200",
  hod: "bg-emerald-100 text-emerald-700 border-emerald-200",
  worker: "bg-zinc-100 text-zinc-600 border-zinc-200",
};
const ROLE_LABEL = { super_admin: "Super Admin", hod: "Head of Department", worker: "Team Member" };

export default function UserProfileDrawer({ userId, onClose, onUpdate }) {
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [depts, setDepts] = useState([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [newDeptId, setNewDeptId] = useState("");
  const [resetedPwd, setResetedPwd] = useState("");

  useEffect(() => {
    Promise.all([
      api.get(`/api/users/${userId}`),
      api.get("/api/departments"),
    ]).then(([userRes, deptsRes]) => {
      setProfile(userRes.data);
      setDepts(deptsRes.data);
      setNewDeptId(userRes.data.department_id || "");
    }).catch((e) => setError(formatError(e)))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSuspend = async () => {
    setActionLoading("suspend");
    try {
      const { data } = await api.put(`/api/users/${userId}/suspend`);
      setProfile((p) => ({ ...p, is_active: data.is_active }));
      onUpdate?.();
    } catch (e) { setError(formatError(e)); }
    finally { setActionLoading(""); }
  };

  const handleTransfer = async () => {
    setActionLoading("transfer");
    try {
      const { data } = await api.put(`/api/users/${userId}/transfer`, { new_department_id: newDeptId });
      setProfile(data);
      setShowTransfer(false);
      onUpdate?.();
    } catch (e) { setError(formatError(e)); }
    finally { setActionLoading(""); }
  };

  const handleResetPassword = async () => {
    setActionLoading("reset");
    try {
      const { data } = await api.post(`/api/users/${userId}/reset-password`, {});
      setResetedPwd(data.new_password);
    } catch (e) { setError(formatError(e)); }
    finally { setActionLoading(""); }
  };

  const deptName = profile?.department_id
    ? depts.find((d) => d.department_id === profile.department_id)?.name || "Unknown"
    : "—";

  const isAdmin = currentUser?.role === "super_admin";
  const canManage = isAdmin || (currentUser?.role === "hod" && profile?.department_id === currentUser?.department_id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col z-10"
        style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>User Profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-red-600">{error}</div>
        ) : profile ? (
          <div className="flex-1 overflow-y-auto">
            {/* Profile Header */}
            <div className="px-5 pt-5 pb-4 border-b border-zinc-100">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                  {profile.name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-zinc-900 leading-tight" style={{ fontFamily: "Outfit, sans-serif" }}>{profile.name}</p>
                  <p className="text-sm text-zinc-500">{profile.professional_title || ROLE_LABEL[profile.role]}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_BADGE[profile.role]} mt-1 inline-block capitalize`}>
                    {ROLE_LABEL[profile.role]}
                  </span>
                  {!profile.is_active && (
                    <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200 inline-block">
                      Suspended
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.employee_id && (
                  <span className="text-[10px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded font-mono">{profile.employee_id}</span>
                )}
                <span className="text-[10px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded">{deptName}</span>
                {profile.employment_type && (
                  <span className="text-[10px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded capitalize">{profile.employment_type.replace("_", " ")}</span>
                )}
              </div>
            </div>

            {/* Contact */}
            <div className="px-5 py-4 border-b border-zinc-50 space-y-2.5">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Contact</p>
              {[
                { icon: Mail, value: profile.email, label: "Email" },
                { icon: Phone, value: profile.mobile_number, label: "Mobile" },
                { icon: MapPin, value: profile.address, label: "Address" },
              ].filter(({ value }) => value).map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-400">{label}</p>
                    <p className="text-sm text-zinc-700">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Professional */}
            <div className="px-5 py-4 border-b border-zinc-50 space-y-2.5">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Professional</p>
              {[
                { icon: Briefcase, label: "Department", value: deptName },
                { icon: Calendar, label: "Joining Date", value: profile.joining_date },
                { icon: User, label: "Experience Level", value: profile.experience_level },
                { icon: Calendar, label: "Shift Timing", value: profile.shift_timing },
              ].filter(({ value }) => value).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-400">{label}</p>
                    <p className="text-sm text-zinc-700 capitalize">{value?.replace?.("_", " ") || value}</p>
                  </div>
                </div>
              ))}
              {profile.skills?.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-400 mb-1.5">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((s) => (
                      <span key={s} className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.bio && (
                <div>
                  <p className="text-[10px] text-zinc-400 mb-1">Bio</p>
                  <p className="text-xs text-zinc-600 leading-relaxed">{profile.bio}</p>
                </div>
              )}
            </div>

            {/* Social */}
            {(profile.linkedin_url || profile.github_url || profile.portfolio_url) && (
              <div className="px-5 py-4 border-b border-zinc-50 space-y-2">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Social & Links</p>
                {profile.linkedin_url && (
                  <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 transition-colors">
                    <Linkedin className="w-4 h-4" /> {profile.linkedin_url}
                  </a>
                )}
                {profile.github_url && (
                  <a href={profile.github_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900 transition-colors">
                    <Github className="w-4 h-4" /> {profile.github_url}
                  </a>
                )}
                {profile.portfolio_url && (
                  <a href={profile.portfolio_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900 transition-colors">
                    <Globe className="w-4 h-4" /> {profile.portfolio_url}
                  </a>
                )}
              </div>
            )}

            {/* Admin Actions */}
            {canManage && profile.user_id !== currentUser?.user_id && (
              <div className="px-5 py-4 space-y-3">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Account Actions</p>

                {/* Suspend/Activate */}
                <button data-testid={`suspend-user-${userId}`} onClick={handleSuspend}
                  disabled={actionLoading === "suspend"}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-all ${
                    profile.is_active
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  }`}>
                  {actionLoading === "suspend" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {profile.is_active ? "Suspend Account" : "Activate Account"}
                </button>

                {/* Reset Password (admin only) */}
                {isAdmin && (
                  <button data-testid={`reset-pwd-${userId}`} onClick={handleResetPassword}
                    disabled={actionLoading === "reset"}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border border-amber-200 text-amber-700 hover:bg-amber-50 transition-all">
                    {actionLoading === "reset" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Reset Password
                  </button>
                )}
                {resetedPwd && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-medium">New temporary password:</p>
                    <p className="text-sm font-mono font-bold text-amber-900 mt-1">{resetedPwd}</p>
                    <p className="text-[10px] text-amber-600 mt-1">Share securely with the user.</p>
                  </div>
                )}

                {/* Transfer Department (admin only) */}
                {isAdmin && (
                  <div>
                    <button data-testid={`transfer-user-${userId}`} onClick={() => setShowTransfer(!showTransfer)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border border-purple-200 text-purple-700 hover:bg-purple-50 transition-all">
                      <ArrowLeftRight className="w-4 h-4" />
                      Transfer Department
                    </button>
                    {showTransfer && (
                      <div className="mt-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-2">
                        <select value={newDeptId} onChange={(e) => setNewDeptId(e.target.value)}
                          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                          {depts.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => setShowTransfer(false)}
                            className="flex-1 border border-zinc-200 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 transition-all">
                            Cancel
                          </button>
                          <button onClick={handleTransfer} disabled={actionLoading === "transfer"}
                            className="flex-1 bg-purple-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-purple-700 transition-all disabled:opacity-60">
                            {actionLoading === "transfer" ? "Transferring..." : "Confirm Transfer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
