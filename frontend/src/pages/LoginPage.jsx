import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/utils/api";
import { Building2, ChevronRight } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS — BREAKS AUTH
const handleGoogleLogin = () => {
  const redirectUrl = window.location.origin + "/";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export default function LoginPage() {
  const { user, login, register, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "worker" });

  if (!loading && user) {
    const routes = { super_admin: "/admin", hod: "/hod", worker: "/worker" };
    return <Navigate to={routes[user.role] || "/worker"} replace />;
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const userData = await login(form.email, form.password);
      const routes = { super_admin: "/admin", hod: "/hod", worker: "/worker" };
      navigate(routes[userData.role] || "/worker", { replace: true });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const userData = await register(form.email, form.password, form.name, form.role);
      const routes = { super_admin: "/admin", hod: "/hod", worker: "/worker" };
      navigate(routes[userData.role] || "/worker", { replace: true });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Left Hero Panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          backgroundImage: `url(https://static.prod-images.emergentagent.com/jobs/381d2b88-3470-44ef-8350-d557ffbb4421/images/31075eb99479da2e01383d85eab170a4fc20a7e0b49714353fe0085ffa7608b8.png)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-indigo-900/70" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-indigo-600" />
            </div>
            <span className="text-white text-2xl font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>
              TeamOS
            </span>
          </div>
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="text-5xl font-semibold text-white leading-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Your workforce,<br />fully orchestrated.
          </h1>
          <p className="text-indigo-100 text-lg max-w-md">
            Manage teams, track tasks, collaborate in real-time, and get AI-powered insights — all in one platform.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[["1000+", "Teams"], ["98%", "Uptime"], ["AI-Ready", "Platform"]].map(([val, label]) => (
              <div key={label} className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
                <div className="text-white text-2xl font-bold" style={{ fontFamily: "Outfit, sans-serif" }}>{val}</div>
                <div className="text-indigo-200 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10">
          <p className="text-indigo-200 text-sm">© 2026 TeamOS Enterprise Platform</p>
        </div>
      </div>

      {/* Right Auth Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-zinc-900 text-2xl font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>TeamOS</span>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
            <h2 className="text-2xl font-semibold text-zinc-950 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
              {tab === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-zinc-500 text-sm mb-6">
              {tab === "login" ? "Sign in to your workspace" : "Get started with TeamOS"}
            </p>

            {/* Tab Switcher */}
            <div className="flex bg-zinc-100 rounded-xl p-1 mb-6">
              {["login", "register"].map((t) => (
                <button
                  key={t}
                  data-testid={`auth-tab-${t}`}
                  onClick={() => { setTab(t); setError(""); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                >
                  {t === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div data-testid="auth-error" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={tab === "login" ? handleLogin : handleRegister} className="space-y-4">
              {tab === "register" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    data-testid="register-name-input"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    placeholder="Alex Chen"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Email</label>
                <input
                  data-testid="auth-email-input"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="you@company.com"
                  className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Password</label>
                <input
                  data-testid="auth-password-input"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              {tab === "register" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Role</label>
                  <select
                    data-testid="register-role-select"
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all"
                  >
                    <option value="worker">Worker</option>
                    <option value="hod">Head of Department</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              )}
              <button
                data-testid="auth-submit-button"
                type="submit"
                disabled={busy}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {tab === "login" ? "Sign In" : "Create Account"}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center text-xs text-zinc-400">
                <span className="px-3 bg-white">or continue with</span>
              </div>
            </div>

            <button
              data-testid="google-login-button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 border border-zinc-200 rounded-lg py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>

            {/* Demo hint */}
            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="text-xs text-indigo-700 font-medium mb-1">Demo Credentials</p>
              <p className="text-xs text-indigo-600">admin@teamOS.com / Admin@123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
