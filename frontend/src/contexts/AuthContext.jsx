import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import api from "@/utils/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);     // null = checking, false = not auth, object = auth
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const [wsStatus, setWsStatus] = useState("disconnected"); // connected | connecting | disconnected
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  const connectWS = useCallback((userId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const backend = process.env.REACT_APP_BACKEND_URL || "";
    const wsUrl = backend.replace("https://", "wss://").replace("http://", "ws://") + `/api/ws/${userId}`;
    
    setWsStatus("connecting");
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        wsRef.current = ws;
        reconnectAttemptsRef.current = 0;
        setWsStatus("connected");
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsStatus("disconnected");
        if (intentionalCloseRef.current) return;
        // Exponential back-off: 2s, 4s, 8s, max 30s
        const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => connectWS(userId), delay);
      };

      ws.onerror = () => { /* errors handled in onclose */ };
    } catch { /* ignore WS init errors */ }
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

  const logout = async () => {
    intentionalCloseRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    await api.post("/api/auth/logout").catch(() => {});
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus("disconnected");
    intentionalCloseRef.current = false;
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
    <AuthContext.Provider value={{ user, loading, login, logout, handleGoogleSession, checkAuth, getWS, wsStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
