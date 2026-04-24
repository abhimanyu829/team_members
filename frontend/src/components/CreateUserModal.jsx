import { useState, useEffect } from "react";
import api, { formatError } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  X, RefreshCw, Eye, EyeOff, Check, Copy, CheckCircle2, Plus, Trash2,
  Camera, Loader2
} from "lucide-react";

function genUsername(name) {
  const parts = name.toLowerCase().trim().split(/\s+/);
  const first = parts[0] || "user";
  const last = parts[parts.length - 1] !== first ? parts[parts.length - 1] : "";
  const base = last ? `${first}.${last}` : first;
  return base + Math.floor(100 + Math.random() * 900);
}

function genPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  return (
    upper[Math.floor(Math.random() * upper.length)] +
    Array.from({ length: 4 }, () => lower[Math.floor(Math.random() * lower.length)]).join("") +
    "@" +
    Array.from({ length: 3 }, () => digits[Math.floor(Math.random() * digits.length)]).join("")
  );
}

const TABS = [
  { id: "account", label: "Account" },
  { id: "professional", label: "Professional" },
  { id: "social", label: "Social & Links" },
  { id: "personal", label: "Personal" },
];

export default function CreateUserModal({ onClose, onSuccess, defaultRole, lockDept, departments = [], users = [] }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("account");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState({});
  const [result, setResult] = useState(null);
  const [skillInput, setSkillInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/api/files/upload?is_profile=true", formData);
      set("picture", data.file_id);
    } catch (err) {
      setError("Failed to upload photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [form, setForm] = useState({
    full_name: "", email: "", username: "", temp_password: genPassword(),
    role: defaultRole || (user?.role === "hod" ? "worker" : "worker"),
    department_id: lockDept || user?.department_id || "",
    employee_id: "", professional_title: "", reporting_manager_id: "",
    joining_date: new Date().toISOString().split("T")[0],
    skills: [], bio: "", experience_level: "mid",
    employment_type: "full_time", shift_timing: "9-5",
    linkedin_url: "", github_url: "", instagram_id: "",
    facebook_id: "", portfolio_url: "",
    mobile_number: "", address: "", emergency_contact: "", is_active: true,
  });

  const set = (k, v) => {
    const u = { ...form, [k]: v };
    if (k === "full_name" && v && !form.username) u.username = genUsername(v);
    setForm(u);
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills.includes(s)) setForm({ ...form, skills: [...form.skills, s] });
    setSkillInput("");
  };

  const removeSkill = (s) => setForm({ ...form, skills: form.skills.filter((x) => x !== s) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { setError("Name and email are required"); setTab("account"); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/users/create-full", form);
      setResult(data);
      onSuccess?.(data.user);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (key, text) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied({ [key]: true });
    setTimeout(() => setCopied({}), 2000);
  };

  const availableDepts = departments.filter((d) => {
    if (lockDept) return d.department_id === lockDept;
    return true;
  });

  const roleOptions = user?.role === "super_admin"
    ? [{ value: "worker", label: "Junior" }, { value: "hod", label: "Subsenior of Branch" }]
    : [{ value: "worker", label: "Junior" }];

  const managers = users.filter((u) =>
    u.role === "hod" && (!form.department_id || u.department_id === form.department_id)
  );

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
            User Created!
          </h3>
          <p className="text-sm text-zinc-500 mb-6">{result.user.name} has been added to the platform.</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-4">
            <p className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wider">Login Credentials</p>
            {[
              { key: "email", label: "Email", value: result.credentials.email },
              { key: "username", label: "Username", value: result.credentials.username },
              { key: "password", label: "Temp Password", value: result.credentials.temp_password },
            ].map(({ key, label, value }) => (
              <div key={key} className="flex items-center justify-between mb-2.5">
                <div>
                  <p className="text-[10px] font-semibold text-amber-600 uppercase">{label}</p>
                  <p className="text-sm font-mono font-medium text-amber-900">{value}</p>
                </div>
                <button onClick={() => copy(key, value)} data-testid={`copy-cred-${key}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-xs text-amber-700 hover:bg-amber-50 transition-all">
                  {copied[key] ? <><Check className="w-3 h-3 text-emerald-600" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mb-4">Share securely. User should change password on first login.</p>
          <button data-testid="user-created-done" onClick={onClose}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-all">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Add Team Member</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Complete the profile to onboard a new member</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 px-6 bg-zinc-50/50">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all ${tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-zinc-400 hover:text-zinc-600"}`}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-6 mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 180px)" }}>
            <div className="p-6">
              {/* TAB: Account */}
              {tab === "account" && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Photo Upload */}
                  <div className="col-span-2 flex items-center gap-4 mb-4 pb-4 border-b border-zinc-50">
                    <div className="relative group">
                      <div className="w-16 h-16 rounded-2xl bg-zinc-100 border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-400 overflow-hidden group-hover:border-indigo-400 group-hover:bg-indigo-50 transition-all">
                        {form.picture ? (
                          <img src={form.picture.startsWith('http') ? form.picture : `/api/files/${form.picture}/download`} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <Camera className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-medium">Photo</span>
                          </>
                        )}
                      </div>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                      {uploadingPhoto && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-2xl">
                          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-700">Profile Photo</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Click to upload. PNG/JPG max 2MB.</p>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                    <input data-testid="user-name-input" required value={form.full_name}
                      onChange={(e) => set("full_name", e.target.value)} placeholder="John Doe"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Email *</label>
                    <input data-testid="user-email-input" required type="email" value={form.email}
                      onChange={(e) => set("email", e.target.value)} placeholder="john@company.com"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Username</label>
                    <div className="flex gap-2">
                      <input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="auto-suggested"
                        className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button type="button" onClick={() => set("username", genUsername(form.full_name || "user"))}
                        className="px-2.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors">
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Temp Password</label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input type={showPassword ? "text" : "password"} value={form.temp_password}
                          onChange={(e) => set("temp_password", e.target.value)}
                          className="w-full border border-zinc-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400">
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <button type="button" onClick={() => set("temp_password", genPassword())}
                        className="px-2.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors">
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Role</label>
                    <select value={form.role} onChange={(e) => set("role", e.target.value)}
                      disabled={!!defaultRole || user?.role === "hod"}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-zinc-50 disabled:text-zinc-400">
                      {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Department</label>
                    <select value={form.department_id} onChange={(e) => set("department_id", e.target.value)}
                      disabled={!!lockDept}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-zinc-50 disabled:text-zinc-400">
                      <option value="">Select department</option>
                      {availableDepts.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* TAB: Professional */}
              {tab === "professional" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Employee ID</label>
                    <input value={form.employee_id} onChange={(e) => set("employee_id", e.target.value)} placeholder="EMP0001"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Professional Title</label>
                    <input value={form.professional_title} onChange={(e) => set("professional_title", e.target.value)} placeholder="Senior Developer"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Reporting Manager</label>
                    <select value={form.reporting_manager_id} onChange={(e) => set("reporting_manager_id", e.target.value)}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="">Select manager</option>
                      {managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Joining Date</label>
                    <input type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Experience Level</label>
                    <select value={form.experience_level} onChange={(e) => set("experience_level", e.target.value)}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="junior">Junior (0-2 years)</option>
                      <option value="mid">Mid-level (2-5 years)</option>
                      <option value="senior">Senior (5+ years)</option>
                      <option value="lead">Lead / Principal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Employment Type</label>
                    <select value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="full_time">Full-time</option>
                      <option value="part_time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="intern">Intern</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Shift Timing</label>
                    <input value={form.shift_timing} onChange={(e) => set("shift_timing", e.target.value)} placeholder="9 AM – 5 PM"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Skills</label>
                    <div className="flex gap-2 mb-2">
                      <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                        placeholder="Type skill + Enter"
                        className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button type="button" onClick={addSkill} className="px-3 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {form.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {form.skills.map((s) => (
                          <span key={s} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs px-2.5 py-1 rounded-full">
                            {s}
                            <button type="button" onClick={() => removeSkill(s)}><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Bio / About</label>
                    <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={2} placeholder="Brief bio..."
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* TAB: Social */}
              {tab === "social" && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { k: "linkedin_url", label: "LinkedIn URL", placeholder: "linkedin.com/in/name" },
                    { k: "github_url", label: "GitHub URL", placeholder: "github.com/username" },
                    { k: "instagram_id", label: "Instagram ID", placeholder: "@username" },
                    { k: "facebook_id", label: "Facebook ID", placeholder: "facebook.com/name" },
                    { k: "portfolio_url", label: "Portfolio / Website", placeholder: "https://yoursite.com" },
                  ].map(({ k, label, placeholder }) => (
                    <div key={k} className={k === "portfolio_url" ? "col-span-2" : ""}>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
                      <input value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder}
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* TAB: Personal */}
              {tab === "personal" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Mobile Number</label>
                    <input value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} placeholder="+1 555-0100"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Emergency Contact</label>
                    <input value={form.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value)} placeholder="Name: +1 555-0200"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Address</label>
                    <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, City, Country"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-zinc-700">Activate account immediately</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-zinc-100 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 border border-zinc-200 text-zinc-700 rounded-lg py-2 text-sm hover:bg-zinc-50 transition-all">
              Cancel
            </button>
            <button data-testid="submit-create-user" type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-semibold transition-all disabled:opacity-60">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Create Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
