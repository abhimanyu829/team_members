import { useState } from "react";
import api, { formatError } from "@/utils/api";
import {
  Building2, Code, Palette, BarChart3, Megaphone, Database, Cpu, Globe,
  Users, ShoppingBag, BookOpen, Briefcase, ChevronRight, ChevronLeft,
  X, RefreshCw, Check, Copy, Eye, EyeOff, CheckCircle2
} from "lucide-react";

const COLORS = [
  { value: "#4F46E5", label: "Indigo" }, { value: "#10B981", label: "Emerald" },
  { value: "#F59E0B", label: "Amber" }, { value: "#EF4444", label: "Red" },
  { value: "#8B5CF6", label: "Purple" }, { value: "#0EA5E9", label: "Sky" },
  { value: "#F97316", label: "Orange" }, { value: "#14B8A6", label: "Teal" },
];

const ICONS = [
  { value: "building", Icon: Building2 }, { value: "code", Icon: Code },
  { value: "palette", Icon: Palette }, { value: "chart", Icon: BarChart3 },
  { value: "megaphone", Icon: Megaphone }, { value: "database", Icon: Database },
  { value: "cpu", Icon: Cpu }, { value: "globe", Icon: Globe },
  { value: "users", Icon: Users }, { value: "bag", Icon: ShoppingBag },
  { value: "book", Icon: BookOpen }, { value: "briefcase", Icon: Briefcase },
];

function generateUsername(name) {
  const parts = name.toLowerCase().trim().split(/\s+/);
  const first = parts[0] || "user";
  const last = parts[parts.length - 1] !== first ? parts[parts.length - 1] : "";
  const base = last ? `${first}.${last}` : first;
  return base + Math.floor(100 + Math.random() * 900);
}

function generatePassword() {
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

export default function CreateDepartmentModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState({});
  const [result, setResult] = useState(null);

  const [dept, setDept] = useState({
    name: "", description: "", color: "#4F46E5", icon: "building", status: "active"
  });
  const [hod, setHod] = useState({
    hod_full_name: "", hod_email: "", hod_username: "", hod_temp_password: "",
    hod_mobile: "", hod_title: "Head of Department", hod_bio: "",
    hod_joining_date: "", hod_linkedin: "", hod_github: ""
  });

  const handleDeptChange = (k, v) => setDept({ ...dept, [k]: v });
  const handleHodChange = (k, v) => {
    const update = { ...hod, [k]: v };
    if (k === "hod_full_name" && v && !hod.hod_username) {
      update.hod_username = generateUsername(v);
    }
    setHod(update);
  };

  const goToStep2 = () => {
    if (!dept.name.trim()) { setError("Department name is required"); return; }
    setError("");
    if (!hod.hod_temp_password) setHod((h) => ({ ...h, hod_temp_password: generatePassword() }));
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hod.hod_full_name.trim() || !hod.hod_email.trim()) {
      setError("HOD name and email are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/departments/create-with-hod", { ...dept, ...hod });
      setResult(data);
      setStep(3);
      onSuccess?.(data.department);
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

  const DeptIcon = ICONS.find((i) => i.value === dept.icon)?.Icon || Building2;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              {step === 3 ? "Department Created!" : "Create Department"}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {step === 1 ? "Step 1 of 2 — Department details" : step === 2 ? "Step 2 of 2 — HOD profile" : "Share credentials with the new HOD"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Step indicator */}
        {step < 3 && (
          <div className="px-6 py-3 border-b border-zinc-50 bg-zinc-50/50">
            <div className="flex items-center gap-3">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s <= step ? "bg-indigo-600 text-white" : "bg-zinc-200 text-zinc-500"}`}>
                    {s < step ? <Check className="w-3 h-3" /> : s}
                  </div>
                  <span className={`text-xs font-medium ${s === step ? "text-indigo-700" : "text-zinc-400"}`}>
                    {s === 1 ? "Department" : "HOD Profile"}
                  </span>
                  {s < 2 && <ChevronRight className="w-3 h-3 text-zinc-300" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          {/* Step 1: Department Info */}
          {step === 1 && (
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Left: Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Department Name *</label>
                    <input data-testid="dept-name-input" required value={dept.name}
                      onChange={(e) => handleDeptChange("name", e.target.value)}
                      placeholder="e.g. Product Design"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Description</label>
                    <textarea value={dept.description} onChange={(e) => handleDeptChange("description", e.target.value)}
                      rows={3} placeholder="What does this department do?"
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Status</label>
                    <select value={dept.status} onChange={(e) => handleDeptChange("status", e.target.value)}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Right: Color + Icon + Preview */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Theme Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map(({ value, label }) => (
                        <button key={value} title={label} onClick={() => handleDeptChange("color", value)}
                          className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${dept.color === value ? "ring-2 ring-offset-2 ring-zinc-400 scale-110" : ""}`}
                          style={{ backgroundColor: value }}
                        >
                          {dept.color === value && <Check className="w-3 h-3 text-white mx-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Department Icon</label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {ICONS.map(({ value, Icon }) => (
                        <button key={value} onClick={() => handleDeptChange("icon", value)}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${dept.icon === value ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Preview */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Preview</label>
                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: dept.color }}>
                          <DeptIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{dept.name || "Department Name"}</p>
                          <p className="text-xs text-zinc-400">{dept.status}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-6 pt-4 border-t border-zinc-100">
                <button data-testid="dept-next-button" onClick={goToStep2}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all">
                  Next: HOD Profile <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: HOD Profile */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                  <input data-testid="hod-name-input" required value={hod.hod_full_name}
                    onChange={(e) => handleHodChange("hod_full_name", e.target.value)}
                    placeholder="Sarah Miller"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Email *</label>
                  <input data-testid="hod-email-input" required type="email" value={hod.hod_email}
                    onChange={(e) => handleHodChange("hod_email", e.target.value)}
                    placeholder="sarah@company.com"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Username</label>
                  <div className="flex gap-2">
                    <input value={hod.hod_username}
                      onChange={(e) => handleHodChange("hod_username", e.target.value)}
                      placeholder="auto-generated"
                      className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => handleHodChange("hod_username", generateUsername(hod.hod_full_name || "user"))}
                      className="px-2.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Temp Password</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type={showPassword ? "text" : "password"} value={hod.hod_temp_password}
                        onChange={(e) => handleHodChange("hod_temp_password", e.target.value)}
                        placeholder="auto-generated"
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button type="button" onClick={() => handleHodChange("hod_temp_password", generatePassword())}
                      className="px-2.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Mobile</label>
                  <input value={hod.hod_mobile} onChange={(e) => handleHodChange("hod_mobile", e.target.value)}
                    placeholder="+1 555-0100"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Professional Title</label>
                  <input value={hod.hod_title} onChange={(e) => handleHodChange("hod_title", e.target.value)}
                    placeholder="Head of Department"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Joining Date</label>
                  <input type="date" value={hod.hod_joining_date} onChange={(e) => handleHodChange("hod_joining_date", e.target.value)}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">LinkedIn URL</label>
                  <input value={hod.hod_linkedin} onChange={(e) => handleHodChange("hod_linkedin", e.target.value)}
                    placeholder="linkedin.com/in/name"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">GitHub URL</label>
                  <input value={hod.hod_github} onChange={(e) => handleHodChange("hod_github", e.target.value)}
                    placeholder="github.com/username"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Bio</label>
                  <textarea value={hod.hod_bio} onChange={(e) => handleHodChange("hod_bio", e.target.value)}
                    rows={2} placeholder="Brief professional bio..."
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6 pt-4 border-t border-zinc-100">
                <button type="button" onClick={() => setStep(1)}
                  className="flex items-center gap-2 border border-zinc-200 text-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-50 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button data-testid="create-dept-submit" type="submit" disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60">
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Create Department & HOD"}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Credentials */}
          {step === 3 && result && (
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                {result.department.name} created successfully!
              </h3>
              <p className="text-sm text-zinc-500 mb-6">{result.hod.name} has been assigned as HOD.</p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-4">
                <p className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wider">HOD Login Credentials</p>
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
                    <button onClick={() => copy(key, value)} data-testid={`copy-${key}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-xs text-amber-700 hover:bg-amber-50 transition-all">
                      {copied[key] ? <><Check className="w-3 h-3 text-emerald-600" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mb-4">Share these credentials securely. User should change password on first login.</p>
              <button data-testid="credentials-done-button" onClick={onClose}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-all">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
