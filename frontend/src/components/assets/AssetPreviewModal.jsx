import React, { useState, useEffect, useRef } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

function getFileIcon(mime = "", filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (mime.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return "🖼️";
  if (mime === "application/pdf" || ext === "pdf") return "📄";
  if (mime?.startsWith("video/") || ["mp4","webm","mov"].includes(ext)) return "🎬";
  if (["zip","tar","gz","rar"].includes(ext)) return "🗜️";
  return "📁";
}

function formatSize(bytes) {
  if (!bytes) return "N/A";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function AssetPreviewModal({ asset, onClose, onDownload }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef();

  useEffect(() => {
    fetchPreviewUrl();
  }, [asset.file_id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const fetchPreviewUrl = async () => {
    setLoading(true);
    try {
      // Always fetch a fresh URL from the backend — it handles S3 Express routing
      const res = await fetch(`${BACKEND_URL}/api/assets/${asset.file_id}/download-url`, {
        credentials: "include", // auth cookies
      });
      if (!res.ok) throw new Error("Auth failed");
      const data = await res.json();
      // For S3 Express (mode=proxy) or local, the URL is a backend /stream route
      let url = data.download_url || `/api/assets/${asset.file_id}/stream`;
      if (url.startsWith("/")) url = `${BACKEND_URL}${url}`;
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(`${BACKEND_URL}/api/assets/${asset.file_id}/stream`);
    } finally {
      setLoading(false);
    }
  };

  const mime = asset.mime_type || "";
  const ext = (asset.file_name || "").split(".").pop()?.toLowerCase();
  const isImage = mime.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext);
  const isPDF = mime === "application/pdf" || ext === "pdf";
  const isVideo = mime.startsWith("video/") || ["mp4","webm","mov"].includes(ext);
  const isCode = ["js","ts","jsx","tsx","py","java","go","rs","html","css","json","yaml","yml","md","txt","toml","env"].includes(ext);

  const renderPreview = () => {
    if (loading) return <div className="preview-spinner">⏳ Loading preview…</div>;
    if (!previewUrl) return <div className="preview-unavailable">Preview unavailable</div>;

    if (isImage) {
      return (
        <div className="preview-image-wrap">
          <img src={previewUrl} alt={asset.file_name} className="preview-image" />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="preview-video-wrap">
          <video controls className="preview-video" key={previewUrl}>
            <source src={previewUrl} type={mime} />
            Your browser does not support video.
          </video>
        </div>
      );
    }

    if (isPDF) {
      return (
        <div className="preview-pdf-wrap">
          <iframe
            src={previewUrl}
            title={asset.file_name}
            className="preview-pdf"
            style={{ width: "100%", height: "75vh", border: "none", borderRadius: 8 }}
          />
        </div>
      );
    }

    if (isCode) {
      return (
        <div className="preview-code-placeholder">
          <div className="preview-code-icon">💻</div>
          <p>Code file — download to view in your editor</p>
          <button className="btn-download-preview" onClick={onDownload}>⬇️ Download {asset.file_name}</button>
        </div>
      );
    }

    // ZIP or unknown
    return (
      <div className="preview-generic-wrap">
        <div style={{ fontSize: 72, textAlign: "center", marginBottom: 20 }}>{getFileIcon(mime, asset.file_name)}</div>
        <div className="preview-generic-info">
          <div><strong>File:</strong> {asset.file_name}</div>
          <div><strong>Type:</strong> {mime || ext?.toUpperCase()}</div>
          <div><strong>Size:</strong> {formatSize(asset.file_size)}</div>
          <div><strong>Version:</strong> v{asset.version || 1}</div>
          <div><strong>S3 Key:</strong> <code className="mono tiny">{asset.s3_key || "local"}</code></div>
        </div>
        <button className="btn-download-preview" onClick={onDownload}>⬇️ Download</button>
      </div>
    );
  };

  return (
    <div
      className="asset-preview-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="asset-preview-modal">
        {/* Header */}
        <div className="preview-modal-header">
          <div className="preview-title-row">
            <span className="preview-icon">{getFileIcon(mime, asset.file_name)}</span>
            <div className="preview-title-info">
              <div className="preview-filename">{asset.file_name}</div>
              <div className="preview-submeta">
                <span>{formatSize(asset.file_size)}</span>
                <span className="preview-dot">·</span>
                <span>v{asset.version || 1}</span>
                <span className="preview-dot">·</span>
                <span>{asset.environment}</span>
                <span className="preview-dot">·</span>
                <span className="preview-sender">{asset.sender_name}</span>
              </div>
            </div>
          </div>
          <div className="preview-header-actions">
            <button className="preview-download-btn" onClick={onDownload}>⬇️ Download</button>
            <button className="preview-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="preview-modal-body">
          {renderPreview()}
        </div>

        {/* Footer metadata */}
        <div className="preview-modal-footer">
          <div className="preview-footer-chips">
            {asset.upload_mode === "s3" ? <span className="chip chip-s3">☁️ S3</span> : <span className="chip chip-local">💾 Local</span>}
            {asset.codebase_module && <span className="chip chip-module">📦 {asset.codebase_module}</span>}
            {asset.repository_branch && <span className="chip chip-branch">🌿 {asset.repository_branch}</span>}
            {asset.linked_roadmap_step && <span className="chip chip-roadmap">🗺️ {asset.linked_roadmap_step}</span>}
            {asset.checksum && <span className="chip chip-hash">🔐 {asset.checksum.slice(0, 8)}…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
