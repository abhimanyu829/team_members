import React, { useState, useEffect } from "react";
import AssetPreviewModal from "./AssetPreviewModal";

function formatSize(bytes) {
  if (!bytes) return "N/A";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function VersionTimeline({ fileId, projectId, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [notes, setNotes] = useState("Rollback to restore stable version");
  const [activeIdx, setActiveIdx] = useState(null);

  useEffect(() => {
    if (fileId) fetchVersions();
  }, [fileId]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${fileId}/versions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setVersions(data.versions || []);
      setActiveIdx(data.versions?.length - 1);
    } catch (e) {
      console.error("Failed to load versions", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version) => {
    if (!window.confirm(`Restore asset to v${version.version}? A new version will be created.`)) return;
    setRestoring(version.file_id);
    try {
      const res = await fetch(`/api/assets/${fileId}/rollback/${version.file_id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (data.file_id) {
        await fetchVersions();
        onRestored && onRestored(data);
      }
    } catch (e) {
      console.error("Rollback failed", e);
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="version-timeline-loading">
        <div className="spinner" />
        <span>Loading version history…</span>
      </div>
    );
  }

  if (!versions.length) {
    return (
      <div className="version-timeline-empty">
        <span>📂 No versions found for this asset</span>
      </div>
    );
  }

  const latestVersion = versions[versions.length - 1]?.version;

  return (
    <div className="version-timeline-wrap">
      <div className="version-timeline-header">
        <h4 className="timeline-title">📜 Version History</h4>
        <span className="timeline-count">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Interactive slider */}
      <div className="version-slider-wrap">
        <input
          type="range"
          min={0}
          max={versions.length - 1}
          value={activeIdx ?? versions.length - 1}
          onChange={(e) => setActiveIdx(Number(e.target.value))}
          className="version-slider"
        />
        <div className="version-slider-labels">
          <span>v1</span>
          <span>v{latestVersion} (latest)</span>
        </div>
      </div>

      {/* Selected version card */}
      {activeIdx !== null && versions[activeIdx] && (
        <div className="version-selected-card">
          <div className="version-badge-large">v{versions[activeIdx].version}</div>
          <div className="version-selected-info">
            <div className="version-filename">{versions[activeIdx].file_name}</div>
            <div className="version-meta">
              <span>{new Date(versions[activeIdx].created_at).toLocaleString()}</span>
              <span className="ver-dot">·</span>
              <span>{versions[activeIdx].sender_name}</span>
              <span className="ver-dot">·</span>
              <span>{formatSize(versions[activeIdx].file_size)}</span>
            </div>
            {versions[activeIdx].comments && (
              <div className="version-notes-text">📝 {versions[activeIdx].comments}</div>
            )}
          </div>
          <div className="version-selected-actions">
            <button className="version-preview-btn" onClick={() => setPreviewAsset(versions[activeIdx])}>
              👁️ Preview
            </button>
            {activeIdx !== versions.length - 1 && (
              <button
                className="version-restore-btn"
                onClick={() => handleRestore(versions[activeIdx])}
                disabled={restoring === versions[activeIdx].file_id}
              >
                {restoring === versions[activeIdx].file_id ? "⏳ Restoring…" : "↩️ Restore this version"}
              </button>
            )}
            {activeIdx === versions.length - 1 && (
              <span className="version-latest-label">✅ Current version</span>
            )}
          </div>
        </div>
      )}

      {/* Full timeline */}
      <div className="version-timeline-list">
        {[...versions].reverse().map((v, i) => (
          <div
            key={v.file_id}
            className={`version-node ${activeIdx === versions.length - 1 - i ? "active" : ""}`}
            onClick={() => setActiveIdx(versions.length - 1 - i)}
          >
            <div className="version-node-dot">
              {i === 0 ? <span className="node-dot-current" /> : <span className="node-dot" />}
            </div>
            <div className="version-node-content">
              <div className="version-node-header">
                <span className="version-node-label">v{v.version}</span>
                {i === 0 && <span className="version-latest-chip">LATEST</span>}
                <span className="version-date">{new Date(v.created_at).toLocaleDateString()}</span>
              </div>
              <div className="version-node-sender">{v.sender_name} · <em>{v.sender_role}</em></div>
              {v.comments && (
                <div className="version-node-comment">{v.comments}</div>
              )}
            </div>
            {i !== 0 && (
              <button
                className="version-mini-restore-btn"
                onClick={(e) => { e.stopPropagation(); handleRestore(v); }}
                disabled={!!restoring}
              >
                ↩️
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Rollback notes input */}
      <div className="rollback-notes-wrap">
        <label className="rollback-notes-label">Rollback notes:</label>
        <input
          type="text"
          className="rollback-notes-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why are you rolling back?"
        />
      </div>

      {previewAsset && (
        <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
    </div>
  );
}
