import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import AuthCallback from "@/pages/AuthCallback";
import AdminDashboard from "@/pages/AdminDashboard";
import HODDashboard from "@/pages/HODDashboard";
import WorkerDashboard from "@/pages/WorkerDashboard";
import TasksPage from "@/pages/TasksPage";
import FilesPage from "@/pages/FilesPage";
import MeetingsPage from "@/pages/MeetingsPage";
import SettingsPage from "@/pages/SettingsPage";
import UsersPage from "@/pages/UsersPage";
import ChatHubPage from "@/pages/ChatHubPage";
import WarRoomPage from "@/pages/WarRoomPage";
import BoardroomPage from "@/pages/BoardroomPage";

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-500 font-medium">Loading TeamOS...</p>
      </div>
    </div>
  );
}

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const routes = { super_admin: "/admin", hod: "/hod", worker: "/worker" };
  return <Navigate to={routes[user.role] || "/worker"} replace />;
}

function ProtectedRoute({ children, roles, fullBleed = false }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === "super_admin" ? "/admin" : user.role === "hod" ? "/hod" : "/worker"} replace />;
  }
  return <Layout fullBleed={fullBleed}>{children}</Layout>;
}

function AppRouter() {
  const location = useLocation();

  // CRITICAL: Detect session_id from Google OAuth callback synchronously (not in useEffect)
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<DashboardRedirect />} />
      <Route path="/admin" element={
        <ProtectedRoute roles={["super_admin"]}>
          <AdminDashboard />
        </ProtectedRoute>
      } />
      <Route path="/hod" element={
        <ProtectedRoute roles={["hod"]}>
          <HODDashboard />
        </ProtectedRoute>
      } />
      <Route path="/worker" element={
        <ProtectedRoute roles={["worker"]}>
          <WorkerDashboard />
        </ProtectedRoute>
      } />
      <Route path="/tasks" element={
        <ProtectedRoute>
          <TasksPage />
        </ProtectedRoute>
      } />
      <Route path="/files" element={
        <ProtectedRoute>
          <FilesPage />
        </ProtectedRoute>
      } />
      <Route path="/meetings" element={
        <ProtectedRoute>
          <MeetingsPage />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute roles={["super_admin", "hod"]}>
          <UsersPage />
        </ProtectedRoute>
      } />
      <Route path="/chat" element={
        <ProtectedRoute>
          <ChatHubPage />
        </ProtectedRoute>
      } />
      <Route path="/war-room" element={
        <ProtectedRoute roles={["super_admin", "hod"]}>
          <WarRoomPage />
        </ProtectedRoute>
      } />
      <Route path="/boardroom" element={
        <ProtectedRoute roles={["super_admin", "hod", "worker"]} fullBleed={true}>
          <BoardroomPage />
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
