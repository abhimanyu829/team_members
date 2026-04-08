import { useState, useEffect, useRef } from "react";
import api, { formatError } from "@/utils/api";
import { Upload, FolderOpen, Download, Trash2, File, Image, FileText, Loader2, X, Plus } from "lucide-react";

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
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  async function fetchFiles() {
    try {
      const { data } = await api.get("/api/files");
      setFiles(data);
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
      setFiles((f) => [data, ...f]);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId) {
    await api.delete(`/api/files/${fileId}`).catch(() => {});
    setFiles((f) => f.filter((x) => x.file_id !== fileId));
  }

  async function handleDownload(file) {
    try {
      const { data } = await api.get(`/api/files/${file.file_id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_filename;
      a.click();
      URL.revokeObjectURL(url);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>Files</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{files.length} file{files.length !== 1 ? "s" : ""} stored</p>
        </div>
        <button
          data-testid="upload-file-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading..." : "Upload File"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
          data-testid="file-input"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
          dragActive ? "border-indigo-400 bg-indigo-50" : "border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50"
        }`}
        onClick={() => fileInputRef.current?.click()}
        data-testid="drop-zone"
      >
        <div className="flex flex-col items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragActive ? "bg-indigo-100" : "bg-zinc-100"}`}>
            <Upload className={`w-6 h-6 ${dragActive ? "text-indigo-600" : "text-zinc-400"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700">
              {dragActive ? "Drop file here" : "Drag & drop or click to upload"}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">PDF, images, documents supported</p>
          </div>
        </div>
      </div>

      {/* File List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <FolderOpen className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-500">No files yet</p>
          <p className="text-xs text-zinc-400 mt-1">Upload your first file above</p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-zinc-100 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            <span className="col-span-2">Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Actions</span>
          </div>
          {files.map((file) => {
            const Icon = getFileIcon(file.content_type);
            return (
              <div key={file.file_id} data-testid={`file-row-${file.file_id}`}
                className="grid grid-cols-5 gap-4 px-4 py-3.5 border-b border-zinc-50 hover:bg-zinc-50 items-center transition-colors last:border-b-0">
                <div className="col-span-2 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{file.original_filename}</p>
                    <p className="text-[10px] text-zinc-400">
                      {file.uploader_name} · {new Date(file.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-zinc-500">{file.content_type?.split("/")[1] || "file"}</span>
                <span className="text-xs text-zinc-500">{formatFileSize(file.size)}</span>
                <div className="flex items-center gap-2">
                  <button
                    data-testid={`download-file-${file.file_id}`}
                    onClick={() => handleDownload(file)}
                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-zinc-400 hover:text-indigo-600 transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    data-testid={`delete-file-${file.file_id}`}
                    onClick={() => handleDelete(file.file_id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
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
    </div>
  );
}
