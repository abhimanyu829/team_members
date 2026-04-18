import { useState, useEffect, useRef } from "react";
import api, { formatError } from "@/utils/api";
import { Upload, FolderOpen, Download, Trash2, File, Image, FileText, Loader2, X, Plus, Clock, History, User } from "lucide-react";

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(contentType = "") {
  if (contentType.startsWith("image/")) return Image;
  if (contentType === "application/pdf") return FileText;
  return File;
}

export default function FilesPage() {
  const [activeTab, setActiveTab] = useState("files"); // 'files' or 'history'
  const [files, setFiles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (activeTab === "files") fetchFiles();
    else fetchHistory();
  }, [activeTab]);

  async function fetchFiles() {
    setLoading(true);
    try {
      const { data } = await api.get("/api/files");
      setFiles(data);
    } catch {}
    finally { setLoading(false); }
  }

  async function fetchHistory() {
    setLoading(true);
    try {
      const { data } = await api.get("/api/files/history");
      setHistory(data);
    } catch {}
    finally { setLoading(false); }
  }

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post("/api/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (activeTab === "files") setFiles((f) => [data, ...f]);
      else fetchHistory();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId) {
    await api.delete(`/api/files/${fileId}`).catch(() => {});
    setFiles((f) => f.filter((x) => x.file_id !== fileId));
    if (activeTab === "history") fetchHistory();
  }

  async function handleDownload(fileId, filename) {
    try {
      const { data } = await api.get(`/api/files/${fileId}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      if (activeTab === "history") fetchHistory();
    } catch {}
  }

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-zinc-950 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>File Asset matrix</h1>
          <p className="text-sm text-zinc-500 font-medium">Coordinate and track asset traceability across all dashboards.</p>
        </div>
        <div className="flex items-center gap-2">
            <button
                onClick={() => setActiveTab("files")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "files" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
            >
                <FolderOpen className="w-4 h-4" /> Repository
            </button>
            <button
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    activeTab === "history" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
            >
                <History className="w-4 h-4" /> Activity History
            </button>
        </div>
      </div>

      {activeTab === "files" && (
        <>
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">Live Repository</p>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-60"
                >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Upload New Asset
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
                />
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl px-4 py-3 flex items-center justify-between">
                {error}
                <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                dragActive ? "border-indigo-400 bg-indigo-50/50" : "border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50/50"
                }`}
            >
                <div className="flex flex-col items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dragActive ? "bg-indigo-100 shadow-inner" : "bg-zinc-100"}`}>
                        <Upload className={`w-7 h-7 stroke-[2.5px] ${dragActive ? "text-indigo-600" : "text-zinc-400"}`} />
                    </div>
                    <div>
                        <p className="text-base font-bold text-zinc-800">
                        {dragActive ? "Release to begin transmission" : "Drag & drop file assets or click to browse"}
                        </p>
                        <p className="text-xs text-zinc-400 font-medium mt-1">Cross-dashboard architecture, roadmap PDFs and code traces supported.</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Querying Matrix...</p>
                </div>
            ) : files.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-16 text-center shadow-sm">
                    <FolderOpen className="w-16 h-16 text-zinc-200 mx-auto mb-4 stroke-1" />
                    <p className="text-lg font-bold text-zinc-500">Repository is Empty</p>
                    <p className="text-sm text-zinc-400 mt-1">No file traces discovered in current department.</p>
                </div>
            ) : (
                <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                    <span className="col-span-2">Resource Name</span>
                    <span>Format</span>
                    <span>Capacity</span>
                    <span>Uploader</span>
                    <span className="text-right">Action</span>
                </div>
                {files.map((file) => {
                    const Icon = getFileIcon(file.content_type);
                    return (
                    <div key={file.file_id} className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-zinc-50 hover:bg-zinc-50/80 items-center transition-all last:border-b-0">
                        <div className="col-span-2 flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-indigo-100 shadow-sm">
                                <Icon className="w-5 h-5 text-indigo-600" strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0 flex flex-col">
                                <p className="text-sm font-bold text-zinc-900 truncate">{file.original_filename || file.file_name}</p>
                                <p className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                    <Clock className="w-3 h-3" /> {new Date(file.created_at).toLocaleDateString()} at {new Date(file.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md w-fit uppercase tracking-tighter">{file.content_type?.split("/")[1] || "file"}</span>
                        <span className="text-xs font-bold text-zinc-600">{formatFileSize(file.size || file.file_size)}</span>
                        <div className="flex items-center gap-2">
                             <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center"><User className="w-3.5 h-3.5 text-zinc-500" /></div>
                             <span className="text-xs font-bold text-zinc-700">{file.uploader_name || file.sender_name}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2 text-right">
                        <button
                            onClick={() => handleDownload(file.file_id, file.original_filename || file.file_name)}
                            className="p-2 bg-indigo-50 head-shadow rounded-xl hover:bg-indigo-600 text-indigo-600 hover:text-white transition-all transform active:scale-90"
                            title="Download"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => handleDelete(file.file_id)}
                            className="p-2 bg-rose-50 rounded-xl hover:bg-rose-600 text-rose-600 hover:text-white transition-all transform active:scale-90"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        </div>
                    </div>
                    );
                })}
                </div>
            )}
        </>
      )}

      {activeTab === "history" && (
          <div className="space-y-4">
               <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">Universal Transition Log</p>
                    <button onClick={() => fetchHistory()} className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-600"><Clock className="w-4 h-4" /></button>
               </div>

               {loading ? (
                   <div className="flex flex-col items-center justify-center py-20 gap-3">
                       <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                       <p className="text-xs font-bold text-zinc-400 capitalize">Tracing global logs...</p>
                   </div>
               ) : history.length === 0 ? (
                   <div className="bg-white border border-zinc-200 rounded-2xl p-16 text-center shadow-sm">
                        <History className="w-16 h-16 text-zinc-200 mx-auto mb-4 stroke-1" />
                        <p className="text-lg font-bold text-zinc-500">No History Records</p>
                        <p className="text-sm text-zinc-400 mt-1">Activity from different dashboards will appear here.</p>
                   </div>
               ) : (
                   <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                            <span className="col-span-2">Involved Resource</span>
                            <span>Operation</span>
                            <span>Executor</span>
                            <span>Timeline</span>
                            <span className="text-right">Trace</span>
                        </div>
                        {history.map((act) => (
                            <div key={act.activity_id} className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-zinc-50 hover:bg-zinc-50/80 items-center transition-all last:border-b-0">
                                <div className="col-span-2 flex items-center gap-4 min-w-0">
                                    <div className={`w-10 h-10 ${act.action === 'downloaded' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'} rounded-xl flex items-center justify-center flex-shrink-0 border shadow-sm`}>
                                        {act.action === 'downloaded' ? <Download className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-zinc-900 truncate">{act.file_info?.original_filename || "Deleted Asset"}</p>
                                        <p className="text-[10px] font-bold text-indigo-500/70 border border-indigo-500/10 px-1.5 py-0.5 rounded-md bg-indigo-50/30 w-fit mt-1">
                                            {act.metadata?.project_id ? `Project Trace: ${act.metadata.project_id}` : 'General File'}
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                                        act.action === 'downloaded' ? 'bg-emerald-50 text-emerald-600 border-emerald-200/50' : 'bg-blue-50 text-blue-600 border-blue-200/50'
                                    }`}>
                                        {act.action}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                     <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center"><User className="w-3.5 h-3.5 text-zinc-500" /></div>
                                     <span className="text-xs font-bold text-zinc-700">{act.user_name}</span>
                                </div>
                                <span className="text-xs font-semibold text-zinc-500">{new Date(act.timestamp).toLocaleDateString()} · {new Date(act.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                <div className="text-right">
                                    <button 
                                        onClick={() => handleDownload(act.file_id, act.file_info?.original_filename)}
                                        className="text-xs font-black text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 decoration-2 underline-offset-4"
                                    >
                                        Extract Copy
                                    </button>
                                </div>
                            </div>
                        ))}
                   </div>
               )}
          </div>
      )}
    </div>
  );
}
