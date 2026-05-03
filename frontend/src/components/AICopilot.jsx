import { useState, useEffect, useRef } from "react";
import api, { formatError } from "@/utils/api";
import { Sparkles, Send, X, Loader2, Bot, User } from "lucide-react";

const QUICK_PROMPTS = [
  "What are my overdue tasks?",
  "Summarize my team's progress",
  "What should I prioritize today?",
  "Draft a task for code review",
];

export default function AICopilot({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get("/api/ai/history")
      .then(({ data }) => {
        const msgs = data.flatMap((item) => [
          { role: "user", content: item.message, id: `u_${item.chat_id}` },
          { role: "assistant", content: item.response, id: `a_${item.chat_id}` },
        ]);
        setMessages(msgs);
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text = input) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text.trim(), id: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/ai/chat", { message: text.trim() });
      setMessages((m) => [...m, { role: "assistant", content: data.response, id: Date.now() + 1 }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${formatError(err)}`, id: Date.now() + 1, isError: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-indigo-50/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">AI Copilot</p>
            <p className="text-[10px] text-zinc-400">Claude Sonnet</p>
          </div>
        </div>
        <button aria-label="Close AI Copilot" onClick={onClose} data-testid="ai-copilot-close" className="p-1 rounded hover:bg-zinc-100 transition-colors">
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!historyLoaded ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white rounded-xl rounded-tl-sm border border-zinc-200 px-3 py-2.5 max-w-[85%]">
                <p className="text-sm text-zinc-700">
                  Hi! I'm Takshak. I can help you manage tasks, summarize work, and boost productivity.
                  What can I help you with?
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1">Quick Prompts</p>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  data-testid={`quick-prompt-${prompt.slice(0, 20).replace(/\s/g, "-")}`}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left text-xs px-3 py-2 bg-white border border-zinc-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-zinc-600"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-zinc-200" : "bg-indigo-600"}`}>
                {msg.role === "user"
                  ? <User className="w-4 h-4 text-zinc-600" />
                  : <Bot className="w-4 h-4 text-white" />
                }
              </div>
              <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-tr-sm"
                  : msg.isError
                    ? "bg-red-50 text-red-700 border border-red-200 rounded-tl-sm"
                    : "bg-white text-zinc-700 border border-zinc-200 rounded-tl-sm"
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl rounded-tl-sm px-3 py-2.5">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t border-zinc-200 bg-white">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex gap-2"
        >
          <input
            data-testid="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your work..."
            className="flex-1 text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-zinc-400"
          />
          <button
            aria-label="Send message"
            data-testid="ai-chat-send"
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
