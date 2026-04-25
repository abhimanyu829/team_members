import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import api, { formatError } from "@/utils/api";
import { User, Shield, Save, CheckCircle, Camera, Loader2, Globe, Github, Linkedin, Smartphone, MapPin, KeyRound, AtSign, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const { user, checkAuth: refreshUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    mobile_number: user?.mobile_number || "",
    bio: user?.bio || "",
    linkedin_url: user?.linkedin_url || "",
    github_url: user?.github_url || "",
    portfolio_url: user?.portfolio_url || "",
    address: user?.address || "",
    picture: user?.picture || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  // Credentials state (super_admin only)
  const [creds, setCreds] = useState({ username: "", email: "", new_password: "", confirm_password: "" });
  const [savingCreds, setSavingCreds] = useState(false);
  const [savedCreds, setSavedCreds] = useState(false);
  const [credsError, setCredsError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        mobile_number: user.mobile_number || "",
        bio: user.bio || "",
        linkedin_url: user.linkedin_url || "",
        github_url: user.github_url || "",
        portfolio_url: user.portfolio_url || "",
        address: user.address || "",
        picture: user.picture || "",
      });
      setCreds({ username: user.username || "", email: user.email || "", new_password: "", confirm_password: "" });
    }
  }, [user]);

  const handleSaveCreds = async (e) => {
    e.preventDefault();
    setCredsError("");
    if (creds.new_password && creds.new_password !== creds.confirm_password) {
      setCredsError("Passwords do not match.");
      return;
    }
    if (creds.new_password && creds.new_password.length < 8) {
      setCredsError("Password must be at least 8 characters.");
      return;
    }
    const payload = {};
    if (creds.username && creds.username !== user?.username) payload.username = creds.username;
    if (creds.email && creds.email !== user?.email) payload.email = creds.email;
    if (creds.new_password) payload.password = creds.new_password;
    if (!Object.keys(payload).length) { setCredsError("No changes to save."); return; }
    setSavingCreds(true);
    try {
      await api.put(`/api/users/${user?.user_id}/update-full`, payload);
      await refreshUser();
      setSavedCreds(true);
      setCreds((prev) => ({ ...prev, new_password: "", confirm_password: "" }));
      setTimeout(() => setSavedCreds(false), 3000);
    } catch (err) {
      setCredsError(formatError(err));
    } finally {
      setSavingCreds(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/api/files/upload?is_profile=true", formData);
      setForm({ ...form, picture: data.file_id });
      // Update immediately on backend for photo
      await api.put(`/api/users/${user?.user_id}/update-full`, { picture: data.file_id });
      await refreshUser();
    } catch (err) {
      setError("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/api/users/${user?.user_id}/update-full`, form);
      await refreshUser();
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
    <div className="max-w-3xl space-y-6 pb-12" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage your personal profile and account preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Info & Quick Actions */}
        <div className="md:col-span-1 space-y-6">
          {/* Avatar Card */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="relative group mb-4">
              <div className="w-24 h-24 rounded-3xl bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden border-4 border-white shadow-md">
                {form.picture ? (
                  <img src={form.picture.startsWith('http') ? form.picture : `/api/files/${form.picture}/download`} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  user?.name?.[0]?.toUpperCase() || "U"
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>
              <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border border-zinc-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-zinc-50 shadow-sm transition-all group-hover:scale-110">
                <Camera className="w-4 h-4 text-zinc-600" />
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
              </label>
            </div>
            <h3 className="font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>{user?.name}</h3>
            <p className="text-xs text-zinc-500 mb-3">{user?.email}</p>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${roleColors[user?.role]}`}>
              {roleLabels[user?.role]}
            </span>
          </div>

          {/* Security Summary */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-zinc-900 font-semibold text-sm">
              <Shield className="w-4 h-4 text-indigo-500" />
              Account Security
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">Username</span>
                <span className="font-mono text-zinc-900 font-medium">{user?.username || "—"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">Status</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                </span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 bg-zinc-50 p-2 rounded-lg leading-relaxed">
              {user?.role === "super_admin"
                ? "As Super Admin, you can update your own credentials in the section below."
                : "Username and password can only be changed by a Super Admin for security compliance."}
            </p>
          </div>
        </div>

        {/* Right Col: Edit Form */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Personal Information</h3>
              </div>
              {saved && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Changes saved
                </span>
              )}
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-3 mb-2">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" /> Mobile Number
                  </label>
                  <input
                    value={form.mobile_number}
                    onChange={(e) => setForm({ ...form, mobile_number: e.target.value })}
                    placeholder="+1 555-0000"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Bio / Professional Summary</label>
                  <textarea
                    rows={3}
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Tell us about yourself..."
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Address
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Your current residence"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-50">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Professional & Social</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      value={form.linkedin_url}
                      onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                      placeholder="LinkedIn URL"
                      className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      value={form.github_url}
                      onChange={(e) => setForm({ ...form, github_url: e.target.value })}
                      placeholder="GitHub URL"
                      className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="relative md:col-span-2">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      value={form.portfolio_url}
                      onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })}
                      placeholder="Portfolio / Website URL"
                      className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm shadow-indigo-200 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving..." : "Save All Changes"}
              </button>
            </div>
          </form>

          {/* ── Credentials Card (Super Admin only) ── */}
          {user?.role === "super_admin" && (
            <form onSubmit={handleSaveCreds} className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <KeyRound className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Account Credentials</h3>
                </div>
                {savedCreds && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Credentials updated
                  </span>
                )}
              </div>
              <div className="p-6 space-y-5">
                {credsError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-3">{credsError}</div>
                )}
                {/* Username */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <AtSign className="w-3.5 h-3.5" /> Username
                  </label>
                  <input
                    value={creds.username}
                    onChange={(e) => setCreds({ ...creds, username: e.target.value })}
                    placeholder="your_username"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Current: <span className="font-mono">{user?.username || "—"}</span></p>
                </div>
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <AtSign className="w-3.5 h-3.5" /> Email Address
                  </label>
                  <input
                    type="email"
                    value={creds.email}
                    onChange={(e) => setCreds({ ...creds, email: e.target.value })}
                    placeholder="your.email@example.com"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Current: <span className="font-mono">{user?.email || "—"}</span></p>
                </div>
                {/* New Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={creds.new_password}
                        onChange={(e) => setCreds({ ...creds, new_password: e.target.value })}
                        placeholder="Min. 8 characters"
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={creds.confirm_password}
                        onChange={(e) => setCreds({ ...creds, confirm_password: e.target.value })}
                        placeholder="Re-enter password"
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚠️ Leave password fields blank to update only your username or email. Changes take effect on next login.
                </p>
              </div>
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end">
                <button type="submit" disabled={savingCreds}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm shadow-indigo-200 disabled:opacity-60">
                  {savingCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {savingCreds ? "Updating..." : "Update Credentials"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
