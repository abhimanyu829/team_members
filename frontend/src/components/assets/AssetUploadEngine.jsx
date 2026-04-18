import React, { useState, useRef, useCallback, useEffect } from "react";
import { useUploadQueue, UPLOAD_STATUS } from "../../stores/uploadQueueStore";
import api from "@/utils/api";
import { UploadCloud, CheckCircle2, AlertCircle, Trash2, RotateCcw, X, Plus, Info } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB → multipart
const CHUNK_SIZE = 10 * 1024 * 1024;            // 10MB per chunk

const FILE_CATEGORIES = [
  "Block Architecture", "System Flow", "Deployment Flow", "Sequence Logic",
  "Notebook LLM Diagram", "Flowchart", "Code Payload", "PDF Report",
  "Roadmap Visual", "Worker Submission", "Other",
];

const ENVIRONMENTS = ["development", "staging", "production", "testing"];

// ─── Checksum utility ─────────────────────────────────────────────────────────
async function computeChecksum(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target.result;
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hex = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        resolve(hex);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Progress ring ────────────────────────────────────────────────────────────
function ProgressRing({ progress, size = 36, strokeWidth = 3, status }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;

  const color =
    status === UPLOAD_STATUS.DONE ? "#22c55e" :
    status === UPLOAD_STATUS.ERROR ? "#ef4444" :
    status === UPLOAD_STATUS.DUPLICATE ? "#f59e0b" :
    "#818cf8";

  return (
    <svg width={size} height={size} className="progress-ring shrink-0">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.35s ease", transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
      />
    </svg>
  );
}

// ─── Status label ─────────────────────────────────────────────────────────────
function StatusLabel({ status, error }) {
  const labels = {
    [UPLOAD_STATUS.QUEUED]: "⏳ Queued",
    [UPLOAD_STATUS.VALIDATING]: "🔍 Validating…",
    [UPLOAD_STATUS.REQUESTING_SESSION]: "🔐 Requesting session…",
    [UPLOAD_STATUS.UPLOADING]: "☁️ Uploading…",
    [UPLOAD_STATUS.CONFIRMING]: "✅ Confirming…",
    [UPLOAD_STATUS.DONE]: "✅ Done",
    [UPLOAD_STATUS.ERROR]: `❌ ${error || "Error"}`,
    [UPLOAD_STATUS.CANCELLED]: "🚫 Cancelled",
    [UPLOAD_STATUS.DUPLICATE]: "⚠️ Duplicate detected",
    [UPLOAD_STATUS.ABORTED]: "🛑 Aborted",
  };
  return <span className={`text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded ${
    status === UPLOAD_STATUS.DONE ? 'bg-emerald-100 text-emerald-700' : 
    status === UPLOAD_STATUS.ERROR ? 'bg-red-100 text-red-700' :
    'bg-zinc-100 text-zinc-600'
  }`}>{labels[status] || status}</span>;
}

// ─── Queue Item ───────────────────────────────────────────────────────────────
function QueueItem({ item, onCancel, onRetry, onRemove }) {
  return (
    <div className={`flex items-center gap-4 p-4 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors ${item.status === UPLOAD_STATUS.DONE ? 'bg-emerald-50/20' : ''}`}>
      <ProgressRing progress={item.progress} status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-zinc-900 truncate">{item.fileName}</span>
            <StatusLabel status={item.status} error={item.error} />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
          <span>{(item.fileSize / 1024).toFixed(0)} KB</span>
          {item.moduleName && <span className="flex items-center gap-1">· <Info size={12} /> {item.moduleName}</span>}
        </div>
        {item.isDuplicate && (
          <div className="mt-2 text-[10px] text-amber-600 font-medium flex items-center gap-1.5">
            <AlertCircle size={12} /> Duplicate detected. Existing ID: {item.duplicateFileId}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {(item.status === UPLOAD_STATUS.UPLOADING || item.status === UPLOAD_STATUS.REQUESTING_SESSION) && (
          <button className="p-2 hover:bg-zinc-200 text-zinc-500 rounded-lg transition-all" onClick={() => onCancel(item)} title="Cancel"><X size={16} /></button>
        )}
        {item.status === UPLOAD_STATUS.ERROR && (
          <button className="p-2 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all" onClick={() => onRetry(item)} title="Retry"><RotateCcw size={16} /></button>
        )}
        {/* Delete button always available as per user request (does not cancel in-progress) */}
        <button className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all" onClick={() => onRemove(item.id)} title="Remove from Queue">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AssetUploadEngine({
  projectId,
  departmentId,
  linkedChatThread = null,
  linkedRoadmapStep = null,
  linkedDeploymentStage = null,
  onUploadComplete,
  compact = false,
}) {
  const { state, dispatch, addFiles, removeFile, clearDone } = useUploadQueue();
  const [isDragOver, setIsDragOver] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formMeta, setFormMeta] = useState({
    moduleName: "General",
    fileCategory: "Other",
    environment: "development",
    repositoryBranch: "main",
    tags: "",
    attachmentNotes: "",
  });
  const fileInputRef = useRef();
  const abortControllersRef = useRef({});

  // ─── Fetch storage status ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchStorageStatus = async () => {
      try {
        const { data } = await api.get("/api/assets/storage/status");
        setStorageStatus(data);
        dispatch({ type: "SET_STORAGE_INFO", storageMode: data.storage_mode, s3Enabled: data.s3_enabled });
      } catch {}
    };
    fetchStorageStatus();
  }, []);

  // ─── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) enqueueFiles(dropped);
  }, [formMeta, projectId, departmentId]);

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) enqueueFiles(files);
    e.target.value = "";
  };

  const enqueueFiles = (files) => {
    const meta = {
      projectId,
      departmentId,
      moduleName: formMeta.moduleName,
      fileCategory: formMeta.fileCategory,
      environment: formMeta.environment,
      repositoryBranch: formMeta.repositoryBranch,
      tags: formMeta.tags.split(",").map((t) => t.trim()).filter(Boolean),
      attachmentNotes: formMeta.attachmentNotes,
      linkedChatThread,
      linkedRoadmapStep,
      linkedDeploymentStage,
    };
    addFiles(files, meta);
  };

  const handleSubmitAll = async () => {
    if (state.queue.length === 0) return;
    
    // Explicit Validation before triggering backend
    if (!projectId || !departmentId) {
        alert("Critical Error: Missing Project or Department Context. Cannot initiate upload session.");
        return;
    }
    
    const queuedItems = state.queue.filter(i => i.status === UPLOAD_STATUS.QUEUED);
    if (queuedItems.length === 0) return;
    
    setIsUploading(true);
    for (const item of queuedItems) {
      const meta = {
        projectId,
        departmentId,
        moduleName: item.moduleName,
        fileCategory: item.fileCategory,
        environment: item.environment,
        repositoryBranch: item.repositoryBranch,
        tags: item.tags,
        attachmentNotes: item.attachmentNotes,
        linkedChatThread: item.linkedChatThread,
        linkedRoadmapStep: item.linkedRoadmapStep,
        linkedDeploymentStage: item.linkedDeploymentStage,
      };
      await startUpload(item.file, meta, item.id);
    }
    setIsUploading(false);
  };

  // ─── Main Upload Orchestrator ──────────────────────────────────────────────
  const startUpload = async (file, meta, existingId = null) => {
    const updateStatus = (id, status, extra = {}) =>
      dispatch({ type: "SET_STATUS", id, status, ...extra });
    const updateProgress = (id, progress) =>
      dispatch({ type: "SET_PROGRESS", id, progress });

    // STEP 0: Compute checksum
    let checksum = null;
    try {
      checksum = await computeChecksum(file);
    } catch {}

    let id = existingId;
    if (!id) {
        let attempts = 0;
        let item = null;
        while (!item && attempts < 10) {
          item = state.queue.find((i) => i.fileName === file.name && i.status === UPLOAD_STATUS.QUEUED);
          if (!item) { await new Promise(r => setTimeout(r, 100)); attempts++; }
        }
        if (!item) return;
        id = item.id;
    }

    dispatch({ type: "SET_CHECKSUM", id, checksum });

    // STEP 1: Validate / check duplicate
    updateStatus(id, UPLOAD_STATUS.VALIDATING);

    if (checksum && projectId) {
      try {
        const { data: dupData } = await api.get(`/api/assets/intelligence/duplicate/${checksum}`, {
            params: { project_id: projectId }
        });
        if (dupData.is_duplicate) {
          dispatch({ type: "SET_DUPLICATE", id, duplicateFileId: dupData.existing_asset?.file_id });
          return;
        }
      } catch {}
    }

    // STEP 2: Decide upload path
    const useMultipart = file.size > MULTIPART_THRESHOLD && storageStatus?.s3_enabled;
    const useDirectServer = !storageStatus?.s3_enabled;

    if (useDirectServer) {
      await uploadDirect(id, file, meta, checksum, updateStatus, updateProgress);
    } else if (useMultipart) {
      await uploadMultipart(id, file, meta, updateStatus, updateProgress);
    } else {
      await uploadPresigned(id, file, meta, checksum, updateStatus, updateProgress);
    }
  };

  // ─── Presigned URL Upload (Standard S3) ───────────────────────────────────
  const uploadPresigned = async (id, file, meta, checksum, updateStatus, updateProgress) => {
    const abortCtrl = new AbortController();
    abortControllersRef.current[id] = abortCtrl;

    try {
      updateStatus(id, UPLOAD_STATUS.REQUESTING_SESSION);
      const { data: session } = await api.post("/api/assets/upload-session", {
          project_id: meta.projectId,
          department_id: meta.departmentId,
          module_name: meta.moduleName,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || "application/octet-stream",
          linked_chat_thread: meta.linkedChatThread,
          linked_roadmap_step: meta.linkedRoadmapStep,
          linked_deployment_stage: meta.linkedDeploymentStage,
          repository_branch: meta.repositoryBranch,
          environment: meta.environment,
          file_category: meta.fileCategory,
          tags: meta.tags,
          attachment_notes: meta.attachmentNotes,
          upload_source_screen: "asset_upload_engine",
      }, { signal: abortCtrl.signal });

      dispatch({ type: "SET_SESSION", id, sessionId: session.session_id, s3Key: session.s3_key });
      updateStatus(id, UPLOAD_STATUS.UPLOADING);
      updateProgress(id, 10);

      if (session.upload_mode === "proxy") {
        // ── S3 Express proxy path ──────────────────────────────────────────
        // S3 Express directory buckets don't support CORS, so the browser can't
        // PUT directly.  We POST the file to our FastAPI proxy which streams it
        // to S3 using server-side IAM credentials instead.
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/api/assets/upload-proxy?session_id=${session.session_id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            if (e.total) updateProgress(id, 10 + Math.round((e.loaded / e.total) * 80));
          },
          signal: abortCtrl.signal,
        });
      } else if (session.presigned_url) {
        // ── Standard S3 presigned PUT ──────────────────────────────────────
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", session.presigned_url);
          // NOTE: Do NOT set Content-Type header here.
          // The presigned URL does not sign content-type in its signature,
          // so setting it triggers an extra CORS preflight that S3 Express rejects.
          // S3 will accept the upload and infer the type from the object key extension.
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = 10 + Math.round((e.loaded / e.total) * 80);
              updateProgress(id, pct);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`S3 upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Network error during S3 upload"));
          xhr.send(file);
          abortCtrl.signal.addEventListener("abort", () => xhr.abort());
        });
      }

      updateStatus(id, UPLOAD_STATUS.CONFIRMING);
      updateProgress(id, 95);

      const { data: confirmed } = await api.post("/api/assets/confirm", {
          session_id: session.session_id,
          checksum,
          file_size: file.size,
      }, { signal: abortCtrl.signal });

      if (confirmed.status === "duplicate_detected") {
        dispatch({ type: "SET_DUPLICATE", id, duplicateFileId: confirmed.existing_file_id });
        return;
      }

      dispatch({ type: "SET_FILE_ID", id, fileId: confirmed.file_id });
      updateProgress(id, 100);
      updateStatus(id, UPLOAD_STATUS.DONE);
      onUploadComplete && onUploadComplete(confirmed);
    } catch (err) {
      if (abortCtrl.signal.aborted) {
        updateStatus(id, UPLOAD_STATUS.CANCELLED);
      } else {
        updateStatus(id, UPLOAD_STATUS.ERROR, { error: err.message });
      }
    } finally {
      delete abortControllersRef.current[id];
    }
  };

  // ─── Direct Server-Side Upload (Local fallback) ────────────────────────────
  const uploadDirect = async (id, file, meta, checksum, updateStatus, updateProgress) => {
    const abortCtrl = new AbortController();
    abortControllersRef.current[id] = abortCtrl;

    try {
      updateStatus(id, UPLOAD_STATUS.UPLOADING);
      const formData = new FormData();
      formData.append("file", file);

      const params = {
        project_id: meta.projectId || "",
        department_id: meta.departmentId || "",
        module_name: meta.moduleName || "General",
        file_category: meta.fileCategory || "Other",
        environment: meta.environment || "development",
        repository_branch: meta.repositoryBranch || "main",
        tags: (meta.tags || []).join(","),
        attachment_notes: meta.attachmentNotes || "",
        ...(meta.linkedChatThread && { linked_chat_thread: meta.linkedChatThread }),
        ...(meta.linkedRoadmapStep && { linked_roadmap_step: meta.linkedRoadmapStep }),
        ...(meta.linkedDeploymentStage && { linked_deployment_stage: meta.linkedDeploymentStage }),
      };

      const { data: result } = await api.post("/api/assets/upload-direct", formData, {
          params,
          onUploadProgress: (e) => {
            if (e.total) updateProgress(id, Math.round((e.loaded / e.total) * 95));
          },
          headers: { "Content-Type": "multipart/form-data" },
          signal: abortCtrl.signal
      });

      if (result.status === "duplicate_detected") {
        dispatch({ type: "SET_DUPLICATE", id, duplicateFileId: result.existing_file_id });
        return;
      }

      dispatch({ type: "SET_FILE_ID", id, fileId: result.file_id });
      updateProgress(id, 100);
      updateStatus(id, UPLOAD_STATUS.DONE);
      onUploadComplete && onUploadComplete(result);
    } catch (err) {
      if (abortCtrl.signal.aborted) {
        updateStatus(id, UPLOAD_STATUS.CANCELLED);
      } else {
        updateStatus(id, UPLOAD_STATUS.ERROR, { error: err.message });
      }
    } finally {
      delete abortControllersRef.current[id];
    }
  };

  // ─── Multipart Upload (>100MB) ─────────────────────────────────────────────
  const uploadMultipart = async (id, file, meta, updateStatus, updateProgress) => {
    const abortCtrl = new AbortController();
    abortControllersRef.current[id] = abortCtrl;

    try {
      updateStatus(id, UPLOAD_STATUS.REQUESTING_SESSION);
      const totalParts = Math.ceil(file.size / CHUNK_SIZE);

      const { data: session } = await api.post("/api/assets/upload-session/multipart", {
          project_id: meta.projectId,
          department_id: meta.departmentId,
          module_name: meta.moduleName,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || "application/octet-stream",
          total_parts: totalParts,
          file_category: meta.file_category,
          environment: meta.environment,
          repository_branch: meta.repository_branch,
          tags: meta.tags,
      });

      dispatch({ type: "SET_SESSION", id, sessionId: session.session_id, s3Key: session.s3_key });
      dispatch({ type: "INIT_CHUNK_PROGRESS", id, totalParts });
      updateStatus(id, UPLOAD_STATUS.UPLOADING);

      const parts = [];
      for (let i = 0; i < totalParts; i++) {
        if (abortCtrl.signal.aborted) throw new Error("Aborted");
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const { data: partData } = await api.post(`/api/assets/upload-session/multipart/${session.session_id}/part`, { 
            part_number: i + 1 
        });
        
        const etag = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", partData.presigned_url);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const chunkPct = (e.loaded / e.total) * 100;
              const overall = Math.round(((i + chunkPct / 100) / totalParts) * 100);
              updateProgress(id, overall);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(xhr.getResponseHeader("ETag")?.replace(/"/g, ""));
            } else reject(new Error(`Chunk ${i + 1} failed`));
          };
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(chunk);
          abortCtrl.signal.addEventListener("abort", () => xhr.abort());
        });

        parts.push({ PartNumber: i + 1, ETag: etag });
      }

      updateStatus(id, UPLOAD_STATUS.CONFIRMING);
      const { data: result } = await api.post(`/api/assets/upload-session/multipart/${session.session_id}/complete`, { 
          parts 
      });

      dispatch({ type: "SET_FILE_ID", id, fileId: result.file_id });
      updateProgress(id, 100);
      updateStatus(id, UPLOAD_STATUS.DONE);
      onUploadComplete && onUploadComplete(result);
    } catch (err) {
      if (abortCtrl.signal.aborted || err.message === "Aborted") {
        const item = state.queue.find((i) => i.id === id);
        if (item?.sessionId) {
          await api.delete(`/api/assets/upload-session/${item.sessionId}`).catch(() => {});
        }
        updateStatus(id, UPLOAD_STATUS.CANCELLED);
      } else {
        updateStatus(id, UPLOAD_STATUS.ERROR, { error: err.message });
      }
    } finally {
      delete abortControllersRef.current[id];
    }
  };

  const handleCancel = (item) => {
    const ctrl = abortControllersRef.current[item.id];
    if (ctrl) ctrl.abort();
  };

  const handleRetry = (item) => {
    dispatch({ type: "SET_STATUS", id: item.id, status: UPLOAD_STATUS.QUEUED });
    dispatch({ type: "SET_PROGRESS", id: item.id, progress: 0 });
    const meta = {
      projectId: item.projectId,
      departmentId: item.departmentId,
      moduleName: item.moduleName,
      fileCategory: item.fileCategory,
      environment: item.environment,
      repositoryBranch: item.repositoryBranch,
      tags: item.tags,
      attachmentNotes: item.attachmentNotes,
      linkedChatThread: item.linkedChatThread,
      linkedRoadmapStep: item.linkedRoadmapStep,
      linkedDeploymentStage: item.linkedDeploymentStage,
    };
    setTimeout(() => startUpload(item.file, meta, item.id), 100);
  };

  const hasActiveUploads = state.queue.some((i) =>
    [UPLOAD_STATUS.UPLOADING, UPLOAD_STATUS.REQUESTING_SESSION, UPLOAD_STATUS.CONFIRMING, UPLOAD_STATUS.VALIDATING].includes(i.status)
  );

  const pendingCount = state.queue.filter(i => i.status === UPLOAD_STATUS.QUEUED).length;

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileInput} />
        <button 
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-all" 
          onClick={() => fileInputRef.current?.click()}
        >
          📎 Attach Files
        </button>
        {state.queue.length > 0 && (
          <div className="flex flex-col gap-1">
            {state.queue.slice(-3).map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <ProgressRing progress={item.progress} status={item.status} size={16} strokeWidth={2} />
                <span className="truncate">{item.fileName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white font-['IBM_Plex_Sans'] overflow-hidden">
      {/* Storage Status */}
      <div className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 ${storageStatus?.s3_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        {storageStatus?.s3_enabled ? (
          <><UploadCloud size={14} /> S3 ACTIVE · {storageStatus.bucket} · PRESIGNED UPLOADS ENABLED</>
        ) : (
          <><AlertCircle size={14} /> LOCAL STORAGE · FILES STORED ON SYSTEM · AWS S3 DISABLED</>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Metadata Form */}
        <section>
          <div className="flex items-center gap-2 mb-4">
             <div className="w-1 h-4 bg-indigo-600 rounded-full"></div>
             <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Payload Metadata</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase">Module / Component</label>
              <input
                type="text"
                value={formMeta.moduleName}
                onChange={(e) => setFormMeta((p) => ({ ...p, moduleName: e.target.value }))}
                placeholder="e.g. Authentication, Payment..."
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase">File Category</label>
              <select
                value={formMeta.fileCategory}
                onChange={(e) => setFormMeta((p) => ({ ...p, fileCategory: e.target.value }))}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium appearance-none outline-none"
              >
                {FILE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase">Environment</label>
              <select
                value={formMeta.environment}
                onChange={(e) => setFormMeta((p) => ({ ...p, environment: e.target.value }))}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium appearance-none outline-none"
              >
                {ENVIRONMENTS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Dropzone */}
        <div
          className={`relative group border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer ${
            isDragOver 
              ? "border-indigo-500 bg-indigo-50" 
              : "border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-300"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileInput} />
          <div className="flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${isDragOver ? 'bg-indigo-600 text-white' : 'bg-white text-zinc-400 shadow-sm'}`}>
              {isDragOver ? <UploadCloud size={32} /> : <Plus size={32} />}
            </div>
            <h4 className="text-base font-bold text-zinc-900">{isDragOver ? "Release to stage files" : "Drop files to stage for submission"}</h4>
            <p className="text-sm text-zinc-500 mt-1">or click here to browse from your system</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="px-2 py-1 bg-white border border-zinc-100 rounded text-[10px] font-bold text-zinc-400">EXE</span>
                <span className="px-2 py-1 bg-white border border-zinc-100 rounded text-[10px] font-bold text-zinc-400">PDF</span>
                <span className="px-2 py-1 bg-white border border-zinc-100 rounded text-[10px] font-bold text-zinc-400">DOCX</span>
            </div>
          </div>
        </div>

        {/* Upload Queue */}
        {state.queue.length > 0 && (
          <section className="bg-zinc-50/50 rounded-3xl border border-zinc-200 overflow-hidden">
            <div className="px-6 py-4 bg-white border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <h3 className="text-sm font-bold text-zinc-900">Queue Stage</h3>
                 <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">{state.queue.length} Total</span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  className="text-xs font-bold text-zinc-400 hover:text-zinc-900 transition-colors"
                  onClick={clearDone}
                >
                  Clear Finished
                </button>
                <div className="w-px h-3 bg-zinc-200"></div>
                <button 
                  className="text-xs font-bold text-red-400 hover:text-red-600 transition-colors"
                  onClick={() => state.queue.forEach(i => removeFile(i.id))}
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className="divide-y divide-zinc-100">
              {state.queue.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onRemove={removeFile}
                />
              ))}
            </div>
            
            {pendingCount > 0 && (
                <div className="p-6 bg-zinc-50 border-t border-zinc-200">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSubmitAll}
                            disabled={isUploading}
                            className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo-200 transition-all disabled:opacity-50 disabled:shadow-none"
                        >
                            {isUploading ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting Payload...</>
                            ) : (
                                <><CheckCircle2 size={18} /> Submit {pendingCount} Pending Assets</>
                            )}
                        </button>
                        {!isUploading && (
                            <button
                                onClick={() => state.queue.forEach(i => removeFile(i.id))}
                                className="px-6 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shrink-0"
                                title="Delete all pending assets"
                            >
                                <Trash2 size={18} /> Delete All
                            </button>
                        )}
                    </div>
                    <p className="text-center text-[10px] text-zinc-400 mt-3 font-medium uppercase tracking-widest">Secure enterprise submission via {storageStatus?.storage_mode?.toUpperCase() || 'LOCAL'}</p>
                </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
