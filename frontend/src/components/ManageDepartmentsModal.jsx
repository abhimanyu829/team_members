import { useState } from "react";
import api, { formatError } from "@/utils/api";
import { Building2, X, Trash2, Loader2 } from "lucide-react";

export default function ManageDepartmentsModal({ onClose, departments, onUpdate }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (dept) => {
    if (!window.confirm(`Are you sure you want to delete the department "${dept.name}"? This action cannot be undone.`)) return;
    setDeleting(dept.department_id);
    try {
      await api.delete(`/api/departments/${dept.department_id}`);
      onUpdate();
    } catch (err) {
      alert(formatError(err) || "Failed to delete department");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Manage Departments</h2>
              <p className="text-xs text-zinc-500">View and delete departments</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          {departments.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No departments found.</p>
          ) : (
            departments.map((dept) => (
              <div key={dept.department_id} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded-xl hover:border-zinc-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: dept.color || "#4F46E5" }}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{dept.name}</p>
                    <p className="text-[10px] text-zinc-500">{dept.status === "active" ? "Active" : "Inactive"}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(dept)}
                  disabled={deleting === dept.department_id}
                  className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete Department"
                >
                  {deleting === dept.department_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
