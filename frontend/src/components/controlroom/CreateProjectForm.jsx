import { useState, useEffect } from "react";
import { Plus, X, Building, Rocket, DollarSign, Calendar as CalIcon, ShieldAlert } from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";

export default function CreateProjectForm({ onProjectCreated, departments, allUsers }) {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    project_type: "SaaS",
    business_goal: "",
    technical_goal: "",
    roadmap_description: "",
    start_date: "",
    deadline: "",
    department_id: departments.length > 0 ? departments[0].department_id : "",
    estimated_budget: 0,
    allocated_budget: 0,
    client_internal: "Internal",
    priority: "High",
    risk_level: "Medium",
    members: [],
    dependencies: []
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addMember = () => {
    setFormData((prev) => ({
      ...prev,
      members: [...prev.members, { user_id: "", role: "worker", name: "" }]
    }));
  };

  const updateMember = (index, field, value) => {
    const newMembers = [...formData.members];
    if (field === "user_id") {
      const selectedUser = allUsers.find(u => u.user_id === value);
      newMembers[index].user_id = value;
      newMembers[index].name = selectedUser?.full_name || selectedUser?.name || "";
    } else {
      newMembers[index][field] = value;
    }
    setFormData((prev) => ({ ...prev, members: newMembers }));
  };

  const removeMember = (index) => {
    setFormData((prev) => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...formData,
        estimated_budget: parseFloat(formData.estimated_budget) || 0,
        allocated_budget: parseFloat(formData.allocated_budget) || 0
      };
      const { data } = await api.post("/api/control-room/projects", payload);
      onProjectCreated(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div className="bg-zinc-900 px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
            <Rocket className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white text-left" style={{ fontFamily: "Outfit, sans-serif" }}>Control Room: Initiative Launch</h2>
            <p className="text-xs text-zinc-400">Deploy a new structured execution container.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8 h-[70vh] overflow-y-auto">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Section 1: Core Config */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-200 pb-2 flex items-center gap-2">
            <Building className="w-4 h-4 text-indigo-600" /> 1. Project Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Project Name</label>
              <input required name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Atlas Core" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Target Department</label>
              <select required name="department_id" value={formData.department_id} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Project Type</label>
              <select required name="project_type" value={formData.project_type} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>SaaS</option>
                <option>AI Agent</option>
                <option>Web Application</option>
                <option>Feature Development</option>
                <option>Automation Workflow</option>
                <option>Mobile App</option>
                <option>Internal Tool</option>
                <option>Manual Custom Entry</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Client / Internal</label>
              <select required name="client_internal" value={formData.client_internal} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Internal</option>
                <option>Client Delivery</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-600 mb-1">Description</label>
            <textarea required name="description" value={formData.description} onChange={handleChange} rows="3" placeholder="Overview of the execution..." className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {/* Section 2: Strategy */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-200 pb-2">2. Strategic Alignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Business Goal</label>
              <textarea required name="business_goal" value={formData.business_goal} onChange={handleChange} rows="2" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Technical Goal</label>
              <textarea required name="technical_goal" value={formData.technical_goal} onChange={handleChange} rows="2" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Development Roadmap Strategy</label>
              <textarea required name="roadmap_description" value={formData.roadmap_description} onChange={handleChange} rows="2" placeholder="Phasing approach..." className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {/* Section 3: Timelines */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-200 pb-2 flex items-center gap-2">
            <CalIcon className="w-4 h-4 text-emerald-600" /> 3. Timeline & Risk Metrics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Start Date</label>
              <input required type="date" name="start_date" value={formData.start_date} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Deadline Date</label>
              <input required type="date" name="deadline" value={formData.deadline} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
             <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Priority</label>
              <select required name="priority" value={formData.priority} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Execution Risk</label>
              <select required name="risk_level" value={formData.risk_level} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Severe</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Validation / Value */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-200 pb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" /> 4. Resource Allocation
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Estimated Total Budget ($)</label>
              <input required type="number" name="estimated_budget" value={formData.estimated_budget} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Initially Approved Budget ($)</label>
              <input required type="number" name="allocated_budget" value={formData.allocated_budget} onChange={handleChange} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* Section 5: Team Mapping */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
             <h3 className="text-sm font-bold text-zinc-900">5. Team Assembly</h3>
             <button type="button" onClick={addMember} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
               <Plus className="w-3 h-3" /> Add Project Access
             </button>
          </div>
          
          {formData.members.length === 0 && (
             <p className="text-xs text-zinc-500 italic">No specific members locked to this workspace. By default only Department HOD accesses this.</p>
          )}

          <div className="space-y-3">
             {formData.members.map((member, idx) => (
               <div key={idx} className="flex items-center gap-3 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                  <select 
                    value={member.user_id} 
                    onChange={e => updateMember(idx, "user_id", e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Team Member</option>
                    {allUsers.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  <select
                    value={member.role}
                    onChange={e => updateMember(idx, "role", e.target.value)}
                    className="w-40 px-3 py-2 bg-white border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="worker">Developer/Worker</option>
                    <option value="manager">Project Manager</option>
                    <option value="hod">Department Head</option>
                  </select>
                  <button type="button" onClick={() => removeMember(idx)} className="p-2 text-rose-500 bg-rose-50 rounded border border-rose-200 hover:bg-rose-100">
                    <X className="w-4 h-4" />
                  </button>
               </div>
             ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-zinc-200 flex justify-end gap-3">
          <button type="submit" disabled={loading} className="px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition-colors flex items-center gap-2">
            {loading ? "Generating OS Instance..." : "Deploy Workspace"} <Rocket className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
