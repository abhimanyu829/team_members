import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/utils/api";
import {
  Search, Send, Paperclip, MoreVertical, Smile,
  Check, CheckCheck, X, Reply, Pin, Trash2, Download,
  File, FileText, Image, Archive, Video, Code,
  MessageSquare, Users, ChevronRight, AlertCircle, Lock,
  UploadCloud, Loader2, Hash, Clock, Shield
} from "lucide-react";

// ─── EMOJI PICKER (inline) ──────────────────────────────────────────────────
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"];

// ─── HELPERS ────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDateSep(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
function isSameDay(a, b) {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function getFileIcon(contentType = "", name = "") {
  if (contentType.startsWith("image/")) return <Image className="w-5 h-5 text-emerald-400" />;
  if (contentType === "application/pdf" || name.endsWith(".pdf")) return <FileText className="w-5 h-5 text-rose-400" />;
  if (contentType.includes("zip") || contentType.includes("tar") || name.match(/\.(zip|tar|gz|rar)$/)) return <Archive className="w-5 h-5 text-amber-400" />;
  if (contentType.startsWith("video/")) return <Video className="w-5 h-5 text-purple-400" />;
  if (name.match(/\.(js|py|ts|jsx|tsx|go|rs|cpp|c|java|sh|json|yml|yaml|env)$/)) return <Code className="w-5 h-5 text-indigo-400" />;
  return <File className="w-5 h-5 text-zinc-400" />;
}
function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function roleColor(role) {
  if (role === "super_admin") return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
  if (role === "hod") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  return "bg-zinc-700/60 text-zinc-300 border-zinc-600/40";
}
function roleLabel(role) {
  if (role === "super_admin") return "Supersenior";
  if (role === "hod") return "Subsenior of Branch";
  return "Junior";
}

// ─── FILE MESSAGE CARD ──────────────────────────────────────────────────────
function FileCard({ fileMeta, isMe }) {
  const { file_id, filename, size, content_type } = fileMeta || {};
  const isImage = content_type?.startsWith("image/");
  const downloadUrl = `/api/files/${file_id}/download`;

  return (
    <div className={`mt-1 rounded-xl overflow-hidden border ${isMe ? "border-indigo-500/30 bg-indigo-700/30" : "border-zinc-700/50 bg-zinc-800/60"}`}>
      {isImage ? (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={downloadUrl}
            alt={filename}
            className="max-w-[280px] max-h-[240px] object-contain block rounded-xl"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        </a>
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isMe ? "bg-indigo-600/30" : "bg-zinc-700/60"}`}>
            {getFileIcon(content_type, filename)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{filename}</p>
            <p className="text-[11px] text-zinc-400">{formatBytes(size)}</p>
          </div>
          <a href={downloadUrl} download={filename} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Download">
            <Download className="w-4 h-4 text-zinc-300" />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── MESSAGE BUBBLE ─────────────────────────────────────────────────────────
function MessageBubble({ msg, isMe, onReply, onPin, onDelete, onReaction, replySource }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (msg.deleted_for_everyone) {
    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} my-0.5`}>
        <div className="px-4 py-2 rounded-2xl bg-zinc-800/60 border border-zinc-700/40 text-zinc-500 text-xs italic flex items-center gap-2">
          <Trash2 className="w-3 h-3" /> This message was deleted
        </div>
      </div>
    );
  }

  const hasReactions = msg.reactions && Object.keys(msg.reactions).some(k => msg.reactions[k].length > 0);

  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} group my-0.5 relative`}>
      <div className={`relative max-w-[75%] sm:max-w-[60%]`} ref={menuRef}>
        {/* Reply context */}
        {replySource && (
          <div className={`mb-1 px-3 py-2 rounded-xl text-xs border-l-4 ${isMe ? "border-indigo-400 bg-indigo-600/20 text-indigo-200" : "border-zinc-500 bg-zinc-800/80 text-zinc-300"}`}>
            <p className="font-bold text-[10px] uppercase mb-0.5 opacity-60">{replySource.sender_name || "Reply"}</p>
            <p className="truncate">{replySource.content || (replySource.file_metadata ? "📎 File" : "")}</p>
          </div>
        )}

        {/* Pin indicator */}
        {msg.is_pinned && (
          <div className="flex items-center gap-1 text-[10px] text-amber-400/70 mb-0.5 px-1">
            <Pin className="w-2.5 h-2.5" /> Pinned
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow transition-all ${
            isMe
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-zinc-800 text-zinc-100 border border-zinc-700/50 rounded-tl-sm"
          }`}
        >
          {/* Context menu trigger */}
          <button
            onClick={() => { setShowMenu(s => !s); setShowEmojiPicker(false); }}
            className={`absolute -top-1 ${isMe ? "-left-7" : "-right-7"} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg bg-zinc-800 border border-zinc-700/50 hover:bg-zinc-700 z-10`}
          >
            <MoreVertical className="w-3.5 h-3.5 text-zinc-300" />
          </button>

          {/* Context menu */}
          {showMenu && (
            <div className={`absolute ${isMe ? "right-0" : "left-0"} top-6 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 py-1 min-w-[160px] overflow-hidden`}>
              <button onClick={() => { onReply(msg); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                <Reply className="w-4 h-4" /> Reply
              </button>
              <button onClick={() => { setShowEmojiPicker(s => !s); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                <Smile className="w-4 h-4" /> React
              </button>
              <button onClick={() => { onPin(msg.message_id); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                <Pin className="w-4 h-4" /> {msg.is_pinned ? "Unpin" : "Pin"}
              </button>
              <div className="border-t border-zinc-700/60 mx-2 my-1" />
              <button onClick={() => { onDelete(msg.message_id, "me"); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete for me
              </button>
              {isMe && (
                <button onClick={() => { onDelete(msg.message_id, "everyone"); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-400 hover:bg-zinc-800 transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete for everyone
                </button>
              )}
            </div>
          )}

          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className={`absolute ${isMe ? "right-0" : "left-0"} -top-12 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 flex gap-1.5 z-50`}>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReaction(msg.message_id, emoji); setShowEmojiPicker(false); }}
                  className="text-xl hover:scale-125 transition-transform active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Message content */}
          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

          {/* File card */}
          {msg.file_metadata && <FileCard fileMeta={msg.file_metadata} isMe={isMe} />}
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
            {Object.entries(msg.reactions).filter(([, users]) => users.length > 0).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReaction(msg.message_id, emoji)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/50 text-xs hover:bg-zinc-700 transition-colors"
              >
                <span>{emoji}</span>
                <span className="text-zinc-300">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + status */}
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
          <span className="text-[10px] text-zinc-500">{formatTime(msg.created_at)}</span>
          {isMe && (
            <span className="text-[10px]">
              {msg.status === "seen"
                ? <CheckCheck className="w-3 h-3 text-blue-400 inline" />
                : msg.status === "delivered"
                ? <CheckCheck className="w-3 h-3 text-zinc-400 inline" />
                : <Check className="w-3 h-3 text-zinc-500 inline" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CONTACT ITEM ───────────────────────────────────────────────────────────
function ContactItem({ contact, isActive, unreadCount, lastMessage, onClick }) {
  const initial = (contact.name || contact.full_name || "?")[0].toUpperCase();
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left relative group ${
        isActive ? "bg-indigo-600/20 border-r-2 border-indigo-500" : "hover:bg-white/5"
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white font-bold text-sm overflow-hidden shadow-lg">
          {contact.picture ? (
            <img src={`/api/files/${contact.picture}/download`} alt="" className="w-full h-full object-cover" />
          ) : initial}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 ${contact.is_online ? "bg-emerald-500" : "bg-zinc-600"}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-semibold text-zinc-100 truncate">{contact.name || contact.full_name}</p>
          {lastMessage && (
            <span className="text-[10px] text-zinc-500 flex-shrink-0 ml-2">{formatTime(lastMessage.created_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${roleColor(contact.role)}`}>
            {roleLabel(contact.role)}
          </span>
          {lastMessage ? (
            <p className="text-xs text-zinc-500 truncate flex-1">
              {lastMessage.content || (lastMessage.msg_type === "file" ? "📎 File" : "")}
            </p>
          ) : (
            <p className="text-xs text-zinc-600 truncate">Start a conversation</p>
          )}
        </div>
      </div>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <div className="flex-shrink-0 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow">
          {unreadCount > 9 ? "9+" : unreadCount}
        </div>
      )}
    </button>
  );
}

// ─── UPLOAD PROGRESS ────────────────────────────────────────────────────────
function UploadProgress({ filename, progress }) {
  return (
    <div className="mx-4 mb-2 p-3 bg-zinc-800 rounded-xl border border-zinc-700/50">
      <div className="flex items-center gap-3 mb-2">
        <UploadCloud className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <p className="text-xs text-zinc-300 truncate flex-1">{filename}</p>
        <span className="text-xs text-indigo-400 font-bold">{progress}%</span>
      </div>
      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function ChatHubPage() {
  const { user, getWS, wsStatus } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [threads, setThreads] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState("threads"); // 'threads' | 'contacts'
  const [replyTo, setReplyTo] = useState(null); // message being replied to
  const [uploadProgress, setUploadProgress] = useState(null); // { filename, progress }
  const [isDragging, setIsDragging] = useState(false);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [chatError, setChatError] = useState(null);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [toastMsg, setToastMsg] = useState(null); // { name, text }
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedContactRef = useRef(null);

  // Keep ref in sync for WS handler
  useEffect(() => { selectedContactRef.current = selectedContact; }, [selectedContact]);

  // ── Initial data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    fetchContacts();
    fetchThreads();
  }, []);

  // ── WebSocket handler ──────────────────────────────────────────────────
  useEffect(() => {
    const ws = getWS();
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const sc = selectedContactRef.current;

        if (data.type === "new_message") {
          const msg = data.message;
          const isInCurrentThread = sc && (msg.sender_id === sc.user_id || msg.receiver_id === sc.user_id);
          if (isInCurrentThread) {
            setMessages(prev => [...prev, msg]);
            // Auto mark seen when viewing that thread
            if (msg.sender_id === sc.user_id) {
              api.post(`/api/chat/mark-seen/${sc.user_id}`).catch(() => {});
            }
          } else {
            // Show toast for messages from other threads
            setToastMsg({ name: msg.sender_name || "Someone", text: msg.content || "📎 File" });
            setTimeout(() => setToastMsg(null), 4000);
          }
          // Update threads sidebar
          fetchThreads();
        } else if (data.type === "message_sent") {
          // Reconcile optimistic message with real ID+status
          setMessages(prev => prev.map(m =>
            m.message_id === data.temp_id ? { ...m, message_id: data.message_id, status: data.status } : m
          ));
        } else if (data.type === "typing") {
          if (sc && data.sender_id === sc.user_id) {
            setOtherTyping(data.is_typing);
          }
        } else if (data.type === "messages_seen") {
          setMessages(prev => prev.map(m =>
            m.chat_id === data.chat_id ? { ...m, status: "seen" } : m
          ));
        } else if (data.type === "message_deleted") {
          setMessages(prev => prev.map(m =>
            m.message_id === data.message_id
              ? { ...m, deleted_for_everyone: true, content: null, file_metadata: null }
              : m
          ));
        } else if (data.type === "message_pinned") {
          setMessages(prev => prev.map(m =>
            m.message_id === data.message_id ? { ...m, is_pinned: data.is_pinned } : m
          ));
        } else if (data.type === "reaction_updated") {
          setMessages(prev => prev.map(m =>
            m.message_id === data.message_id ? { ...m, reactions: data.reactions } : m
          ));
        } else if (data.type === "presence") {
          setContacts(prev => prev.map(c =>
            c.user_id === data.user_id ? { ...c, is_online: data.status === "online" } : c
          ));
          setThreads(prev => prev.map(t =>
            t.other_user?.user_id === data.user_id
              ? { ...t, other_user: { ...t.other_user, is_online: data.status === "online" } }
              : t
          ));
        } else if (data.type === "chat_error") {
          setChatError(data.error);
          setTimeout(() => setChatError(null), 5000);
        }
      } catch { }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [getWS]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Data fetchers ──────────────────────────────────────────────────────
  const fetchContacts = async () => {
    try {
      const { data } = await api.get("/api/chat/contacts");
      setContacts(data);
    } catch { } finally { setLoading(false); }
  };

  const fetchThreads = async () => {
    try {
      const { data } = await api.get("/api/chat/threads");
      setThreads(data);
    } catch { }
  };

  const openThread = async (contact) => {
    setSelectedContact(contact);
    setMessages([]);
    setReplyTo(null);
    setShowFilePanel(false);
    setOtherTyping(false);
    setMsgsLoading(true);
    try {
      const { data } = await api.get(`/api/chat/history/${contact.user_id}`);
      setMessages(data);
      setSharedFiles(data.filter(m => m.file_metadata).map(m => m.file_metadata).reverse());
    } catch { } finally { setMsgsLoading(false); }
    // Mark seen
    api.post(`/api/chat/mark-seen/${contact.user_id}`).catch(() => {});
    // Update thread unread count locally
    setThreads(prev => prev.map(t =>
      t.other_user?.user_id === contact.user_id ? { ...t, unread_count: 0 } : t
    ));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── Send message ───────────────────────────────────────────────────────
  const handleSend = useCallback((e) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !replyTo) || !selectedContact) return;

    const ws = getWS();
    if (!ws || wsStatus !== "connected") {
      setChatError("Connecting to server... please wait a moment.");
      setTimeout(() => setChatError(null), 3000);
      return;
    }

    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      message_id: tempId,
      chat_id: [user.user_id, selectedContact.user_id].sort().join("_"),
      sender_id: user.user_id,
      sender_name: user.name || user.full_name,
      receiver_id: selectedContact.user_id,
      content: newMessage,
      type: "text",
      file_metadata: null,
      reply_to: replyTo?.message_id || null,
      status: "sent",
      is_pinned: false,
      deleted_for: [],
      deleted_for_everyone: false,
      reactions: {},
      created_at: new Date().toISOString(),
      _optimistic: true
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage("");
    setReplyTo(null);
    setShowEmojiBar(false);

    ws.send(JSON.stringify({
      type: "message",
      receiver_id: selectedContact.user_id,
      content: newMessage,
      msg_type: "text",
      reply_to: replyTo?.message_id || null,
      temp_id: tempId
    }));

    sendTypingStatus(false);
  }, [newMessage, selectedContact, replyTo, getWS, user]);

  // ── Typing indicator ───────────────────────────────────────────────────
  const sendTypingStatus = (typing) => {
    const ws = getWS();
    if (ws && ws.readyState === WebSocket.OPEN && selectedContact) {
      ws.send(JSON.stringify({ type: "typing", receiver_id: selectedContact.user_id, is_typing: typing }));
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (!isTyping) { setIsTyping(true); sendTypingStatus(true); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { setIsTyping(false); sendTypingStatus(false); }, 2000);
  };

  // ── File upload ────────────────────────────────────────────────────────
  const uploadFile = async (file) => {
    if (!selectedContact) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadProgress({ filename: file.name, progress: 0 });

    try {
      const { data: fileData } = await api.post("/api/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / (e.total || 1));
          setUploadProgress({ filename: file.name, progress: pct });
        }
      });

      // Send as file message via WS
      const ws = getWS();
      const fileMeta = {
        file_id: fileData.file_id,
        filename: file.name,
        size: fileData.size,
        content_type: fileData.content_type || file.type
      };
      const tempId = `temp_${Date.now()}`;
      const optimisticMsg = {
        message_id: tempId,
        chat_id: [user.user_id, selectedContact.user_id].sort().join("_"),
        sender_id: user.user_id,
        sender_name: user.name,
        receiver_id: selectedContact.user_id,
        content: "",
        type: "file",
        file_metadata: fileMeta,
        reply_to: null,
        status: "sent",
        is_pinned: false,
        deleted_for: [],
        deleted_for_everyone: false,
        reactions: {},
        created_at: new Date().toISOString(),
        _optimistic: true
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setSharedFiles(prev => [fileMeta, ...prev]);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "message",
          receiver_id: selectedContact.user_id,
          content: "",
          msg_type: "file",
          file_metadata: fileMeta,
          temp_id: tempId
        }));
      }
    } catch (err) {
      setChatError("File upload failed. Please try again.");
      setTimeout(() => setChatError(null), 4000);
    } finally {
      setUploadProgress(null);
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  // ── Message actions ────────────────────────────────────────────────────
  const handleReply = (msg) => { setReplyTo(msg); inputRef.current?.focus(); };

  const handlePin = async (messageId) => {
    try { await api.post(`/api/chat/messages/${messageId}/pin`); }
    catch { }
  };

  const handleDelete = async (messageId, deleteFor) => {
    try {
      await api.delete(`/api/chat/messages/${messageId}?delete_for=${deleteFor}`);
      if (deleteFor === "me") {
        setMessages(prev => prev.filter(m => m.message_id !== messageId));
      }
    } catch { }
  };

  const handleReaction = (messageId, emoji) => {
    const ws = getWS();
    if (ws && ws.readyState === WebSocket.OPEN && selectedContact) {
      ws.send(JSON.stringify({
        type: "reaction",
        message_id: messageId,
        emoji,
        receiver_id: selectedContact.user_id
      }));
    }
  };

  // ── Keyboard shortcut ──────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSend();
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    else if (e.key === "Escape" && replyTo) setReplyTo(null);
  };

  // ── Filtered lists ─────────────────────────────────────────────────────
  const filteredContacts = contacts.filter(c =>
    ((c.name || c.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filteredThreads = threads.filter(t =>
    ((t.other_user?.name || t.other_user?.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Get thread info for a contact
  const getThread = (contact) =>
    threads.find(t => t.other_user?.user_id === contact?.user_id);

  // Get reply source message
  const replySourceMsg = replyTo ? messages.find(m => m.message_id === replyTo.message_id) : null;
  const getReplySource = (msg) => {
    if (!msg.reply_to) return null;
    return messages.find(m => m.message_id === msg.reply_to) || null;
  };

  return (
    <div
      className="h-[calc(100vh-80px)] flex overflow-hidden rounded-2xl shadow-2xl border border-zinc-800/80"
      style={{ fontFamily: "IBM Plex Sans, sans-serif", background: "linear-gradient(135deg, #0f0f12 0%, #111118 100%)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── DRAG OVERLAY ── */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-600/20 backdrop-blur-sm border-4 border-dashed border-indigo-500/60 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <UploadCloud className="w-16 h-16 text-indigo-400 mx-auto mb-3" />
            <p className="text-xl font-bold text-white">Drop to send file</p>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ── */}
      {toastMsg && (
        <div className="absolute top-4 right-4 z-50 bg-zinc-900 border border-zinc-700/80 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-xs animate-in slide-in-from-right-4 duration-300">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {toastMsg.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-200">{toastMsg.name}</p>
            <p className="text-xs text-zinc-400 truncate">{toastMsg.text}</p>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ─────────────────── LEFT SIDEBAR ─────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-zinc-800/80 flex flex-col bg-zinc-950/60">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none" style={{ fontFamily: "Outfit, sans-serif" }}>
                Team Chat
              </h2>
              <p className="text-[10px] text-zinc-500">Enterprise Hub</p>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-800/60 border border-zinc-700/40 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none transition-all"
            />
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-1 mt-3 bg-zinc-800/40 rounded-xl p-1">
            <button
              onClick={() => setSidebarTab("threads")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition-all ${sidebarTab === "threads" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Clock className="w-3.5 h-3.5" /> Threads
              {threads.some(t => t.unread_count > 0) && (
                <span className="w-2 h-2 bg-rose-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setSidebarTab("contacts")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition-all ${sidebarTab === "contacts" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Users className="w-3.5 h-3.5" /> Contacts
            </button>
          </div>
        </div>

        {/* Contact / Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : sidebarTab === "threads" ? (
            filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-sm">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No active conversations yet.</p>
                <button onClick={() => setSidebarTab("contacts")} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">Browse contacts →</button>
              </div>
            ) : (
              filteredThreads.map(thread => (
                <ContactItem
                  key={thread.chat_id}
                  contact={thread.other_user}
                  isActive={selectedContact?.user_id === thread.other_user?.user_id}
                  unreadCount={thread.unread_count}
                  lastMessage={thread.last_message}
                  onClick={() => openThread(thread.other_user)}
                />
              ))
            )
          ) : (
            filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-sm">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No contacts found.</p>
              </div>
            ) : (
              filteredContacts.map(contact => {
                const thread = getThread(contact);
                return (
                  <ContactItem
                    key={contact.user_id}
                    contact={contact}
                    isActive={selectedContact?.user_id === contact.user_id}
                    unreadCount={thread?.unread_count || 0}
                    lastMessage={thread?.last_message || null}
                    onClick={() => openThread(contact)}
                  />
                );
              })
            )
          )}
        </div>

        {/* RBAC + Connection Status Label */}
        <div className="p-3 border-t border-zinc-800/60 flex items-center gap-2 text-[10px] text-zinc-600">
          <Shield className="w-3.5 h-3.5" />
          <span>RBAC · {roleLabel(user?.role)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-emerald-500" : wsStatus === "connecting" ? "bg-amber-500 animate-pulse" : "bg-rose-500 animate-pulse"}`} />
            <span className={wsStatus === "connected" ? "text-emerald-600" : wsStatus === "connecting" ? "text-amber-600" : "text-rose-600"}>
              {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Connecting..." : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* ─────────────────── CENTER CHAT PANEL ─────────────────── */}
      {selectedContact ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/40 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white font-bold text-sm overflow-hidden shadow-lg">
                {selectedContact.picture ? (
                  <img src={`/api/files/${selectedContact.picture}/download`} alt="" className="w-full h-full object-cover" />
                ) : (selectedContact.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-zinc-100 leading-tight">{selectedContact.name || selectedContact.full_name}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${roleColor(selectedContact.role)}`}>
                    {roleLabel(selectedContact.role)}
                  </span>
                </div>
                <p className={`text-[11px] font-medium leading-tight ${otherTyping ? "text-indigo-400" : selectedContact.is_online ? "text-emerald-400" : "text-zinc-500"}`}>
                  {otherTyping ? (
                    <span className="flex items-center gap-1">
                      typing
                      <span className="flex gap-0.5 mt-0.5">
                        {[0, 1, 2].map(i => (
                          <span key={i} className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </span>
                    </span>
                  ) : selectedContact.is_online ? "Online" : "Offline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowFilePanel(s => !s)}
                className={`p-2 rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5 ${showFilePanel ? "bg-indigo-600/30 text-indigo-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}
              >
                <Paperclip className="w-4 h-4" />
                <span className="hidden sm:inline">Files</span>
                {sharedFiles.length > 0 && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">{sharedFiles.length}</span>}
              </button>
            </div>
          </div>

          {/* Error banner */}
          {chatError && (
            <div className="mx-4 mt-3 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-sm text-rose-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{chatError}</span>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
            {msgsLoading ? (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                <Lock className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Start your secure conversation</p>
                <p className="text-xs mt-1 opacity-60">Messages are role-restricted & department-enforced</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = msg.sender_id === user.user_id;
                const prev = messages[idx - 1];
                const showDateSep = idx === 0 || !isSameDay(prev?.created_at, msg.created_at);
                const replySource = getReplySource(msg);
                return (
                  <div key={msg.message_id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-zinc-800/60" />
                        <span className="text-[11px] text-zinc-500 font-medium px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800/60">
                          {formatDateSep(msg.created_at)}
                        </span>
                        <div className="flex-1 h-px bg-zinc-800/60" />
                      </div>
                    )}
                    <MessageBubble
                      msg={msg}
                      isMe={isMe}
                      onReply={handleReply}
                      onPin={handlePin}
                      onDelete={handleDelete}
                      onReaction={handleReaction}
                      replySource={replySource}
                    />
                  </div>
                );
              })
            )}
            <div ref={scrollRef} />
          </div>

          {/* Upload Progress */}
          {uploadProgress && (
            <UploadProgress filename={uploadProgress.filename} progress={uploadProgress.progress} />
          )}

          {/* Reply preview strip */}
          {replyTo && (
            <div className="mx-4 mb-1 px-4 py-2.5 bg-zinc-800/60 border border-zinc-700/40 rounded-xl flex items-center gap-3">
              <Reply className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-indigo-400 font-bold mb-0.5">Replying to {replyTo.sender_name || "message"}</p>
                <p className="text-xs text-zinc-400 truncate">{replyTo.content || "📎 File"}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-zinc-700 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
          )}

          {/* Emoji bar */}
          {showEmojiBar && (
            <div className="mx-4 mb-1 flex gap-2 items-center px-4 py-2.5 bg-zinc-800/60 border border-zinc-700/40 rounded-xl">
              {["😊", "😂", "❤️", "🔥", "👍", "🎉", "😢", "🤔", "💯", "🚀", "✅", "👏"].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setNewMessage(m => m + emoji)}
                  className="text-lg hover:scale-125 transition-transform active:scale-95"
                >
                  {emoji}
                </button>
              ))}
              <button onClick={() => setShowEmojiBar(false)} className="ml-auto p-1 hover:bg-zinc-700 rounded-lg">
                <X className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
          )}

          {/* Input Bar */}
          <div className="p-4 flex-shrink-0 border-t border-zinc-800/60 bg-zinc-950/40">
            <div className="flex items-end gap-2 bg-zinc-800/60 rounded-2xl border border-zinc-700/40 p-2 transition-all focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20">
              {/* Emoji button */}
              <button
                onClick={() => setShowEmojiBar(s => !s)}
                className="p-2 text-zinc-400 hover:text-indigo-400 transition-colors rounded-xl hover:bg-zinc-700/60 flex-shrink-0 self-end"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* File attach */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-zinc-400 hover:text-indigo-400 transition-colors rounded-xl hover:bg-zinc-700/60 flex-shrink-0 self-end"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files[0]; if (f) uploadFile(f); e.target.value = ""; }}
              />

              {/* Text input */}
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send, Ctrl+Enter for new line)"
                rows={1}
                className="flex-1 bg-transparent border-none py-2 px-1 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-0 resize-none max-h-32 leading-relaxed"
                style={{ minHeight: "38px" }}
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!newMessage.trim()}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none active:scale-95 self-end"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 text-center mt-1.5">
              Shift+Enter for new line • Drag & drop files to upload
            </p>
          </div>
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="w-24 h-24 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl flex items-center justify-center mb-6">
            <MessageSquare className="w-12 h-12 text-indigo-500/60" />
          </div>
          <h3 className="text-xl font-bold text-zinc-200 mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
            Enterprise Communication Hub
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
            Select a contact or conversation to start chatting. All messages are secured with department-level RBAC.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: Shield, label: "RBAC Enforced" },
              { icon: Lock, label: "Dept Restricted" },
              { icon: Hash, label: "Encrypted Transit" }
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 px-4 py-3 bg-zinc-800/40 rounded-xl border border-zinc-700/30">
                <Icon className="w-5 h-5 text-indigo-400/70" />
                <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────── RIGHT FILE PANEL ─────────────────── */}
      {showFilePanel && selectedContact && (
        <div className="w-72 flex-shrink-0 border-l border-zinc-800/60 flex flex-col bg-zinc-950/60">
          <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Shared Files</h3>
              <p className="text-xs text-zinc-500">{sharedFiles.length} file{sharedFiles.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={() => setShowFilePanel(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sharedFiles.length === 0 ? (
              <div className="text-center py-12 text-zinc-600">
                <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No files shared yet</p>
              </div>
            ) : (
              sharedFiles.map((f, idx) => f && (
                <div key={idx} className="p-3 bg-zinc-800/50 border border-zinc-700/40 rounded-xl hover:bg-zinc-800/80 transition-colors group">
                  <div className="flex items-center gap-2.5 mb-2">
                    {getFileIcon(f.content_type, f.filename)}
                    <p className="text-xs font-semibold text-zinc-200 truncate flex-1">{f.filename}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">{formatBytes(f.size)}</span>
                    <a
                      href={`/api/files/${f.file_id}/download`}
                      download={f.filename}
                      className="opacity-0 group-hover:opacity-100 p-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
