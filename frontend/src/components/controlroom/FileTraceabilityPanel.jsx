import { useState, useEffect, useCallback } from "react";
import { Paperclip, FileCode2, PackageOpen, DownloadCloud, Search, ShieldAlert, Cpu, FolderGit2, GitBranch, GitCommit, Shield, Workflow, Clock, Activity, Layers, Maximize, Minimize, Plus } from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { UploadQueueProvider } from "@/stores/uploadQueueStore";
import AssetUploadEngine from "@/components/assets/AssetUploadEngine";
import AssetCard from "@/components/assets/AssetCard";
import VersionTimeline from "@/components/assets/VersionTimeline";
import ArchitectureGallery from "@/components/assets/ArchitectureGallery";

const CATEGORIES = [
  "All", "Block Architecture", "System Flow", "Deployment Flow",
  "Roadmap Visual", "Notebook LLM Diagram", "Flowchart", "Sequence Logic",
  "Code Payload", "PDF Report", "Worker Submission", "Other",
];

const TABS = [
  { id: "assets", label: "Code Repository", icon: <FolderGit2 size={16} /> },
  { id: "upload", label: "Submit Payload", icon: <Plus size={16} /> },
  { id: "versions", label: "Commit History", icon: <GitCommit size={16} /> },
  { id: "architecture", label: "Architecture", icon: <Layers size={16} /> },
  { id: "audit", label: "Audit Log", icon: <Activity size={16} /> },
];

export default function FileTraceabilityPanel({ project, departmentId }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("assets");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageMode, setStorageMode] = useState("local");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeEnvironment, setActiveEnvironment] = useState("");
  const [selectedFileForVersions, setSelectedFileForVersions] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [wsRef, setWsRef] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    fetchAssets();
    fetchStorageStatus();
    setupWebSocketListener();
    return () => {};
  }, [project.project_id]);

  const setupWebSocketListener = () => {
    const handler = (event) => {
      if (event.type === "asset_uploaded" && event.asset?.project_id === project.project_id) {
        setFiles((prev) => [event.asset, ...prev.filter((f) => f.file_id !== event.asset.file_id)]);
      }
    };
    window.__assetEventHandlers = window.__assetEventHandlers || [];
    window.__assetEventHandlers.push(handler);
    return () => {
      window.__assetEventHandlers = window.__assetEventHandlers?.filter((h) => h !== handler);
    };
  };

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory && activeCategory !== "All") params.set("file_category", activeCategory);
      if (activeEnvironment) params.set("environment", activeEnvironment);
      const { data } = await api.get(`/api/assets/project/${project.project_id}?${params}`);
      setFiles(data.files || []);
      setStorageMode(data.storage_mode || "local");
    } catch {
      try {
        const { data } = await api.get(`/api/control-room/projects/${project.project_id}/files`);
        setFiles(data || []);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  const fetchStorageStatus = async () => {
    try {
      const { data } = await api.get("/api/assets/storage/status");
      setStorageMode(data.storage_mode || "local");
    } catch {}
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const { data } = await api.get(`/api/assets/audit/department/${departmentId}`);
      setAuditLogs(data.audit_log || []);
    } catch {}
    setAuditLoading(false);
  };

  useEffect(() => {
    if (activeTab === "audit") fetchAuditLogs();
    if (activeTab === "assets") fetchAssets();
  }, [activeTab, activeCategory, activeEnvironment]);

  const handleUploadComplete = (result) => {
    setFiles((prev) => [result, ...prev]);
    setActiveTab("assets");
  };

  const filteredFiles = files.filter((f) => {
    const matchesSearch = !searchQuery ||
      f.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.codebase_module?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.sender_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.tags || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === "All" || f.file_category === activeCategory;
    const matchesEnv = !activeEnvironment || f.environment === activeEnvironment;
    return matchesSearch && matchesCategory && matchesEnv;
  });

  return (
    <UploadQueueProvider>
      <div className={`flex flex-col font-['IBM_Plex_Sans'] ${isFullScreen ? 'fixed inset-0 z-[9999] bg-zinc-50 overflow-hidden' : 'h-full bg-white rounded-xl border border-zinc-200'}`}>
        
        {/* ─── Panel Header with Git Aesthetics ─────────────────────────────────── */}
        <div className="bg-zinc-900 text-zinc-100 p-6 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FolderGit2 className="text-indigo-400 w-6 h-6" />
              <h2 className="text-xl font-bold font-['Outfit']">Asset Intelligence Engine</h2>
              <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px] rounded flex items-center gap-1 uppercase tracking-wider">
                <GitBranch size={12} /> Repository Root
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-zinc-400 mt-2">
              {storageMode === "s3"
                ? <span className="flex items-center gap-1 text-emerald-400">☁️ S3 Linked</span>
                : <span className="flex items-center gap-1 text-amber-400">💾 Local State</span>}
              <span className="flex items-center gap-1"><GitCommit size={14} /> {files.length} Assets/Commits Tracked</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
                 onClick={() => setActiveTab("upload")}
                 className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow text-white transition-all border border-indigo-500"
             >
                 <Plus size={16} /> Submit Codebase/Asset
             </button>
             <button 
                 onClick={() => setIsFullScreen(!isFullScreen)}
                 className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all border border-zinc-700 hover:text-white"
                 title={isFullScreen ? "Minimize Dashboard" : "Expand Dashboard"}
             >
                 {isFullScreen ? <Minimize size={18} /> : <Maximize size={18} />}
             </button>
          </div>
        </div>

        {/* ─── Tabs ─────────────────────────────────────────────────────────────── */}
        <div className="bg-zinc-100/50 border-b border-zinc-200 px-6 pt-2 flex items-center gap-6 shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
                activeTab === tab.id 
                  ? "border-indigo-600 text-indigo-600" 
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/30">
          {/* ─── TAB: Upload ──────────────────────────────────────────── */}
          {activeTab === "upload" && (
            <div className="max-w-4xl mx-auto">
              <AssetUploadEngine
                projectId={project.project_id}
                departmentId={departmentId}
                onUploadComplete={handleUploadComplete}
              />
            </div>
          )}

        {/* ─── TAB: Assets ──────────────────────────────────────────── */}
        {activeTab === "assets" && (
          <div className="ftp-tab-content">
            {/* Filters */}
            <div className="ftp-filters">
              <div className="ftp-search-wrap">
                <Search size={14} />
                <input
                  type="text"
                  className="ftp-search"
                  placeholder="Search files, modules, tags…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                className="ftp-filter-select"
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select
                className="ftp-filter-select"
                value={activeEnvironment}
                onChange={(e) => setActiveEnvironment(e.target.value)}
              >
                <option value="">All Environments</option>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="testing">Testing</option>
              </select>
              <button className="ftp-refresh-btn" onClick={fetchAssets} title="Refresh">↺</button>
            </div>

            {/* Asset list */}
            {loading ? (
              <div className="ftp-loading">
                <div className="spinner" />
                <span>Loading assets…</span>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="ftp-empty">
                <PackageOpen size={40} />
                <p>No assets found</p>
                <button className="ftp-upload-cta" onClick={() => setActiveTab("upload")}>
                  ⬆️ Upload First Asset
                </button>
              </div>
            ) : (
              <div className="ftp-asset-list">
                {filteredFiles.map((file) => (
                  <AssetCard
                    key={file.file_id}
                    asset={file}
                    currentUserId={user?.user_id}
                    onVersionClick={(asset) => {
                      setSelectedFileForVersions(asset);
                      setActiveTab("versions");
                    }}
                    onRollback={user?.role !== "worker" ? (asset) => {
                      setSelectedFileForVersions(asset);
                      setActiveTab("versions");
                    } : null}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: Versions ────────────────────────────────────────── */}
        {activeTab === "versions" && (
          <div className="ftp-tab-content">
            {selectedFileForVersions ? (
              <VersionTimeline
                fileId={selectedFileForVersions.file_id}
                projectId={project.project_id}
                onRestored={(restored) => {
                  setFiles((prev) => [restored, ...prev]);
                }}
              />
            ) : (
              <div className="ftp-version-select-prompt">
                <Clock size={40} />
                <p>Select an asset from the Assets tab to view its version history.</p>
                <button className="ftp-goto-assets-btn" onClick={() => setActiveTab("assets")}>
                  → Go to Assets
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: Architecture Gallery ────────────────────────────── */}
        {activeTab === "architecture" && (
          <div className="ftp-tab-content">
            <ArchitectureGallery projectId={project.project_id} />
          </div>
        )}

        {/* ─── TAB: Audit Log ───────────────────────────────────────── */}
        {activeTab === "audit" && (
          <div className="ftp-tab-content">
            {user?.role === "worker" ? (
              <div className="ftp-audit-restricted">
                <ShieldAlert size={32} />
                <p>Audit log access requires HOD or Admin role.</p>
              </div>
            ) : auditLoading ? (
              <div className="ftp-loading"><div className="spinner" /><span>Loading audit log…</span></div>
            ) : auditLogs.length === 0 ? (
              <div className="ftp-empty"><Activity size={40} /><p>No audit events yet</p></div>
            ) : (
              <div className="ftp-audit-list">
                {auditLogs.map((log) => (
                  <div key={log.audit_id} className="audit-entry">
                    <div className="audit-icon">
                      {log.action === "uploaded" || log.action === "uploaded_direct" ? "⬆️" :
                       log.action === "downloaded" ? "⬇️" :
                       log.action === "rollback" ? "↩️" :
                       log.action === "approved" ? "✅" : "🔍"}
                    </div>
                    <div className="audit-info">
                      <div className="audit-action">{log.action.replace(/_/g, " ")}</div>
                      <div className="audit-meta">
                        <span>{log.user_name}</span>
                        <span className="audit-dot">·</span>
                        <span>{log.user_role}</span>
                        <span className="audit-dot">·</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      {log.file_id && <div className="audit-fileid">file: <code>{log.file_id}</code></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </UploadQueueProvider>
  );
}
