import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import api from "@/utils/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);     // null = checking, false = not auth, object = auth
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);

  const connectWS = useCallback((userId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const backend = process.env.REACT_APP_BACKEND_URL || "";
    const wsUrl = backend.replace("https://", "wss://").replace("http://", "ws://") + `/api/ws/${userId}`;
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => { wsRef.current = ws; };
      ws.onclose = () => { setTimeout(() => connectWS(userId), 3000); };
      ws.onerror = () => {};
      wsRef.current = ws;
    } catch { /* ignore WS errors */ }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data);
      setLoading(false);
      connectWS(data.user_id);
    } catch {
      setUser(false);
      setLoading(false);
    }
  }, [connectWS]);

  useEffect(() => {
    // Skip auth check if returning from Google OAuth
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await api.post("/api/auth/login", { email, password });
    setUser(data);
    connectWS(data.user_id);
    return data;
  };

  const register = async (email, password, name, role, department_id) => {
    const { data } = await api.post("/api/auth/register", { email, password, name, role, department_id });
    setUser(data);
    connectWS(data.user_id);
    return data;
  };

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => {});
    wsRef.current?.close();
    wsRef.current = null;
    setUser(false);
  };

  const handleGoogleSession = async (sessionId) => {
    const { data } = await api.post("/api/auth/google/session", { session_id: sessionId });
    setUser(data);
    connectWS(data.user_id);
    return data;
  };

  const getWS = () => wsRef.current;

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, handleGoogleSession, checkAuth, getWS }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
