import React, { useState } from "react";
import AssetPreviewModal from "./AssetPreviewModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

// ─── File type icon helper ────────────────────────────────────────────────────
function getFileIcon(mime = "", filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (mime.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return "🖼️";
  if (mime === "application/pdf" || ext === "pdf") return "📄";
  if (["video/mp4","video/webm","video/quicktime"].includes(mime) || ["mp4","webm","mov"].includes(ext)) return "🎬";
  if (mime === "application/zip" || ["zip","tar","gz","rar"].includes(ext)) return "🗜️";
  if (["js","ts","jsx","tsx","py","java","cpp","go","rs","html","css"].includes(ext)) return "💻";
  if (["md","txt","doc","docx"].includes(ext)) return "📝";
  if (["json","yaml","yml","toml","env","xml"].includes(ext)) return "⚙️";
  if (["xls","xlsx","csv"].includes(ext)) return "📊";
  return "📁";
}

function formatSize(bytes) {
  if (!bytes) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function roleBadgeClass(role) {
  if (role === "super_admin") return "role-badge admin";
  if (role === "hod") return "role-badge hod";
  return "role-badge worker";
}

function approvalBadge(status) {
  const styles = {
    approved: { bg: "#0f2", color: "#0a3" },
    pending: { bg: "#fa0", color: "#804" },
    rejected: { bg: "#f44", color: "#900" },
  };
  const s = styles[status] || styles.pending;
  return (
    <span style={{ background: s.bg + "22", color: s.bg, border: `1px solid ${s.bg}44`, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>
      {status || "pending"}
    </span>
  );
}

export default function AssetCard({ asset, compact = false, onVersionClick, onRollback, currentUserId }) {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isSent = asset.sender_id === currentUserId;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Get the download URL from the backend (fresh, auth-checked)
      const res = await fetch(`${BACKEND_URL}/api/assets/${asset.file_id}/download-url`, {
        credentials: "include", // send auth cookies
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      if (!data.download_url) throw new Error("No download URL returned");

      if (data.mode === "s3") {
        // Standard S3 presigned URL — open directly in new tab
        window.open(data.download_url, "_blank");
      } else {
        // Proxy / local mode: the URL is a backend route that needs auth cookies.
        // Ensure we use the absolute backend URL if it's a relative path
        const finalUrl = data.download_url.startsWith("/") ? `${BACKEND_URL}${data.download_url}` : data.download_url;
        const fileRes = await fetch(finalUrl, { credentials: "include" });
        if (!fileRes.ok) throw new Error(`Stream returned ${fileRes.status}`);
        const blob = await fileRes.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = asset.file_name || "download";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      }
    } catch (e) {
      console.error("Download failed", e);
      alert(`Download failed: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  if (compact) {
    return (
      <div
        className={`asset-card-compact ${isSent ? "sent" : "received"}`}
        onClick={() => setPreviewOpen(true)}
        style={{ cursor: "pointer" }}
      >
        <span className="file-icon">{getFileIcon(asset.mime_type, asset.file_name)}</span>
        <div className="compact-info">
          <span className="compact-name">{asset.file_name}</span>
          <span className="compact-meta">{formatSize(asset.file_size)} · v{asset.version || 1}</span>
        </div>
        {previewOpen && (
          <AssetPreviewModal asset={asset} onClose={() => setPreviewOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`asset-card ${isSent ? "asset-card-sent" : "asset-card-received"}`}>
        {/* ─── Header ─────────────────────────────────────── */}
        <div className="asset-card-header">
          <div className="asset-icon-wrap">
            <span className="asset-file-icon">{getFileIcon(asset.mime_type, asset.file_name)}</span>
          </div>
          <div className="asset-header-info">
            <div className="asset-filename">{asset.file_name}</div>
            <div className="asset-submeta">
              <span className={roleBadgeClass(asset.sender_role)}>{asset.sender_role}</span>
              <span className="asset-dot">·</span>
              <span className="asset-size">{formatSize(asset.file_size)}</span>
              <span className="asset-dot">·</span>
              <span className="asset-version-badge">v{asset.version || 1}</span>
              <span className="asset-dot">·</span>
              {approvalBadge(asset.approval_status)}
            </div>
          </div>
          <div className="asset-card-actions">
            <button className="asset-action-btn preview-btn" onClick={() => setPreviewOpen(true)} title="Preview">
              👁️
            </button>
            <button className="asset-action-btn download-btn" onClick={handleDownload} disabled={downloading} title="Download">
              {downloading ? "⏳" : "⬇️"}
            </button>
            {asset.version > 1 && onVersionClick && (
              <button className="asset-action-btn version-btn" onClick={() => onVersionClick(asset)} title="Version History">
                🕐
              </button>
            )}
            {onRollback && (
              <button className="asset-action-btn rollback-btn" onClick={() => onRollback(asset)} title="Rollback">
                ↩️
              </button>
            )}
            <button className="asset-action-btn expand-btn" onClick={() => setExpanded((p) => !p)} title="Details">
              {expanded ? "▲" : "▼"}
            </button>
          </div>
        </div>

        {/* ─── Storage Mode Badge ─────────────────────────── */}
        <div className="asset-storage-badge">
          {asset.upload_mode === "s3" ? (
            <span className="s3-badge">☁️ S3</span>
          ) : (
            <span className="local-badge">💾 Local</span>
          )}
          {asset.codebase_module && (
            <span className="module-badge">📦 {asset.codebase_module}</span>
          )}
          {asset.environment && (
            <span className={`env-badge env-${asset.environment}`}>{asset.environment}</span>
          )}
        </div>

        {/* ─── Traceability Links ─────────────────────────── */}
        <div className="asset-trace-links">
          {asset.linked_roadmap_step && (
            <span className="trace-chip roadmap-chip">🗺️ {asset.linked_roadmap_step}</span>
          )}
          {asset.linked_deployment_stage && (
            <span className="trace-chip deploy-chip">🚀 {asset.linked_deployment_stage}</span>
          )}
          {asset.linked_chat_thread && (
            <span className="trace-chip chat-chip">💬 {asset.linked_chat_thread}</span>
          )}
        </div>

        {/* ─── Tags ─────────────────────────────────────────── */}
        {asset.tags && asset.tags.length > 0 && (
          <div className="asset-tags">
            {asset.tags.map((tag) => (
              <span key={tag} className="asset-tag">#{tag}</span>
            ))}
          </div>
        )}

        {/* ─── Expanded Intelligence Panel ───────────────── */}
        {expanded && (
          <div className="asset-intelligence-panel">
            <div className="intel-grid">
              <div className="intel-row"><span className="intel-label">Project</span><span className="intel-value">{asset.project_name || asset.project_id}</span></div>
              <div className="intel-row"><span className="intel-label">Dept</span><span className="intel-value">{asset.department_name || asset.department_id}</span></div>
              <div className="intel-row"><span className="intel-label">Sender</span><span className="intel-value">{asset.sender_name}</span></div>
              <div className="intel-row"><span className="intel-label">Branch</span><span className="intel-value">🌿 {asset.repository_branch || "main"}</span></div>
              <div className="intel-row"><span className="intel-label">Module</span><span className="intel-value">{asset.codebase_module || "—"}</span></div>
              <div className="intel-row"><span className="intel-label">Env</span><span className="intel-value">{asset.environment}</span></div>
              <div className="intel-row"><span className="intel-label">Checksum</span><span className="intel-value mono">{asset.checksum ? asset.checksum.slice(0, 12) + "…" : "—"}</span></div>
              <div className="intel-row"><span className="intel-label">S3 Key</span><span className="intel-value mono tiny">{asset.s3_key ? asset.s3_key.slice(0, 40) + "…" : "—"}</span></div>
              <div className="intel-row"><span className="intel-label">AI Status</span><span className="intel-value">{asset.ai_analysis_status || "—"}</span></div>
              <div className="intel-row"><span className="intel-label">Risk Score</span><span className="intel-value">{asset.risk_score ?? 0}</span></div>
              <div className="intel-row"><span className="intel-label">Uploaded</span><span className="intel-value">{new Date(asset.created_at).toLocaleString()}</span></div>
              <div className="intel-row"><span className="intel-label">Retention</span><span className="intel-value">{asset.retention_policy || "standard"}</span></div>
            </div>
            {asset.attachment_notes && (
              <div className="intel-notes">📝 {asset.attachment_notes}</div>
            )}
            {asset.semantic_tags && asset.semantic_tags.length > 0 && (
              <div className="intel-ai-tags">
                <span className="intel-label">AI Tags:</span>
                {asset.semantic_tags.map((t) => (
                  <span key={t} className="ai-tag">{t}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {previewOpen && (
        <AssetPreviewModal asset={asset} onClose={() => setPreviewOpen(false)} onDownload={handleDownload} />
      )}
    </>
  );
}
