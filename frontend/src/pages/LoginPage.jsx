import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/utils/api";
import { Building2, ChevronRight } from "lucide-react";


export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

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

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-zinc-900 text-2xl font-semibold">Takshak</span>
        </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
            <h2 className="text-2xl font-semibold text-zinc-950 mb-1">
              Welcome back
            </h2>
            <p className="text-zinc-500 text-sm mb-6">
              Sign in to your workspace
            </p>

            {/* Error */}
            {error && (
              <div data-testid="auth-error" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Email / Username</label>
                <input
                  data-testid="auth-email-input"
                  name="email"
                  type="text"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="you@company.com or username"
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
                    Sign In
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

          </div>
      </div>
    </div>
  );
}
