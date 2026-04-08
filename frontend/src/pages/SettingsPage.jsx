import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import api, { formatError } from "@/utils/api";
import { User, Shield, Save, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/api/users/${user?.user_id}`, { name: form.name });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const roleLabels = { super_admin: "Super Administrator", hod: "Head of Department", worker: "Team Member" };
  const roleColors = { super_admin: "bg-indigo-100 text-indigo-700", hod: "bg-emerald-100 text-emerald-700", worker: "bg-zinc-100 text-zinc-700" };

  return (
    <div className="max-w-2xl space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage your profile and preferences</p>
      </div>

      {/* Profile */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5 pb-5 border-b border-zinc-100">
          <User className="w-4 h-4 text-zinc-400" />
          <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Profile</h3>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <p className="font-semibold text-zinc-900">{user?.name}</p>
            <p className="text-sm text-zinc-500">{user?.email}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${roleColors[user?.role]}`}>
              {roleLabels[user?.role] || user?.role}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Display Name</label>
            <input
              data-testid="settings-name-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Email</label>
            <input
              disabled
              value={user?.email || ""}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm bg-zinc-50 text-zinc-400 cursor-not-allowed"
            />
          </div>
          <button
            data-testid="settings-save-button"
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
          >
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Security */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5 pb-5 border-b border-zinc-100">
          <Shield className="w-4 h-4 text-zinc-400" />
          <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Security</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-zinc-900">Session</p>
              <p className="text-xs text-zinc-400">Your current active session</p>
            </div>
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded-full font-medium">Active</span>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-zinc-50">
            <div>
              <p className="text-sm font-medium text-zinc-900">Role</p>
              <p className="text-xs text-zinc-400">Your platform role</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColors[user?.role]}`}>
              {roleLabels[user?.role]}
            </span>
          </div>
        </div>
      </div>

      {/* Platform Info */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900 mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>Platform</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Version", "1.0.0-MVP"],
            ["Stack", "FastAPI + React"],
            ["AI Model", "Claude Sonnet 4.5"],
            ["Storage", "Emergent Object Store"],
          ].map(([k, v]) => (
            <div key={k} className="p-3 bg-zinc-50 rounded-lg">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">{k}</p>
              <p className="text-sm font-medium text-zinc-700">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
