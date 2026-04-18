/**
 * Upload Queue Store — useReducer-based state for the Asset Intelligence Engine.
 * No external state library required.
 */
import { createContext, useContext, useReducer, useCallback } from "react";

// ─── Status types ────────────────────────────────────────────────────────────
export const UPLOAD_STATUS = {
  QUEUED: "queued",
  VALIDATING: "validating",
  REQUESTING_SESSION: "requesting_session",
  UPLOADING: "uploading",
  CONFIRMING: "confirming",
  DONE: "done",
  ERROR: "error",
  CANCELLED: "cancelled",
  DUPLICATE: "duplicate",
  ABORTED: "aborted",
};

// ─── Initial state ────────────────────────────────────────────────────────────
const initialState = {
  queue: [],           // Array of upload items
  storageMode: null,   // "s3" | "local"
  s3Enabled: false,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────
function uploadQueueReducer(state, action) {
  switch (action.type) {
    case "ADD_FILES":
      return {
        ...state,
        queue: [
          ...state.queue,
          ...action.files.map((f) => ({
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            file: f,
            fileName: f.name,
            fileSize: f.size,
            mimeType: f.type || "application/octet-stream",
            status: UPLOAD_STATUS.QUEUED,
            progress: 0,
            sessionId: null,
            s3Key: null,
            fileId: null,
            error: null,
            isDuplicate: false,
            duplicateFileId: null,
            chunkProgress: [],
            checksum: null,
            // metadata from upload form
            projectId: action.meta?.projectId || "",
            departmentId: action.meta?.departmentId || "",
            moduleName: action.meta?.moduleName || "General",
            fileCategory: action.meta?.fileCategory || "Other",
            environment: action.meta?.environment || "development",
            repositoryBranch: action.meta?.repositoryBranch || "main",
            linkedChatThread: action.meta?.linkedChatThread || null,
            linkedRoadmapStep: action.meta?.linkedRoadmapStep || null,
            linkedDeploymentStage: action.meta?.linkedDeploymentStage || null,
            tags: action.meta?.tags || [],
            attachmentNotes: action.meta?.attachmentNotes || "",
          })),
        ],
      };

    case "SET_STATUS":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id ? { ...item, status: action.status, error: action.error || item.error } : item
        ),
      };

    case "SET_PROGRESS":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id ? { ...item, progress: action.progress } : item
        ),
      };

    case "SET_CHUNK_PROGRESS":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id
            ? {
                ...item,
                chunkProgress: item.chunkProgress.map((c, i) =>
                  i === action.partIndex ? action.percent : c
                ),
              }
            : item
        ),
      };

    case "SET_SESSION":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id
            ? { ...item, sessionId: action.sessionId, s3Key: action.s3Key }
            : item
        ),
      };

    case "SET_FILE_ID":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id ? { ...item, fileId: action.fileId } : item
        ),
      };

    case "SET_CHECKSUM":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id ? { ...item, checksum: action.checksum } : item
        ),
      };

    case "SET_DUPLICATE":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id
            ? {
                ...item,
                isDuplicate: true,
                duplicateFileId: action.duplicateFileId,
                status: UPLOAD_STATUS.DUPLICATE,
              }
            : item
        ),
      };

    case "SET_ERROR":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id
            ? { ...item, status: UPLOAD_STATUS.ERROR, error: action.error }
            : item
        ),
      };

    case "REMOVE_FILE":
      return {
        ...state,
        queue: state.queue.filter((item) => item.id !== action.id),
      };

    case "CLEAR_DONE":
      return {
        ...state,
        queue: state.queue.filter(
          (item) => item.status !== UPLOAD_STATUS.DONE && item.status !== UPLOAD_STATUS.CANCELLED
        ),
      };

    case "SET_STORAGE_INFO":
      return {
        ...state,
        storageMode: action.storageMode,
        s3Enabled: action.s3Enabled,
      };

    case "INIT_CHUNK_PROGRESS":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.id
            ? { ...item, chunkProgress: new Array(action.totalParts).fill(0) }
            : item
        ),
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const UploadQueueContext = createContext(null);

export function UploadQueueProvider({ children }) {
  const [state, dispatch] = useReducer(uploadQueueReducer, initialState);

  const addFiles = useCallback((files, meta) => {
    dispatch({ type: "ADD_FILES", files, meta });
  }, []);

  const removeFile = useCallback((id) => {
    dispatch({ type: "REMOVE_FILE", id });
  }, []);

  const clearDone = useCallback(() => {
    dispatch({ type: "CLEAR_DONE" });
  }, []);

  return (
    <UploadQueueContext.Provider value={{ state, dispatch, addFiles, removeFile, clearDone }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be inside UploadQueueProvider");
  return ctx;
}
