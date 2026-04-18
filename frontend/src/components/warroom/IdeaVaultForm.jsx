import { useState, useEffect } from "react";
import api from "@/utils/api";
import { Save, Plus, ArrowRight, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function IdeaVaultForm({ onSuccess, onCancel, editData }) {
  const [formData, setFormData] = useState({
    title: "",
    problem_statement: "",
    solution_overview: "",
    target_users: "",
    revenue_model: "",
    estimated_market_need: "",
    monetization_type: "b2b_saas",
    business_risk_level: "Medium",
    priority_level: "Medium",
    innovation_score: 50,
    tools_required: [],
    image_url: ""
  });
  
  const [toolInput, setToolInput] = useState("");
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    if (editData) {
      const { id, _id, author_id, author_name, created_at, updated_at, status, ...rest } = editData;
      setFormData({ ...rest, tools_required: rest.tools_required || [], image_url: rest.image_url || "" });
      setImageFile(null);
    } else {
      setFormData({
        title: "",
        problem_statement: "",
        solution_overview: "",
        target_users: "",
        revenue_model: "",
        estimated_market_need: "",
        monetization_type: "b2b_saas",
        business_risk_level: "Medium",
        priority_level: "Medium",
        innovation_score: 50,
        tools_required: [],
        image_url: ""
      });
      setImageFile(null);
    }
  }, [editData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTool = (e) => {
    e.preventDefault();
    if (toolInput.trim() && !formData.tools_required.includes(toolInput.trim())) {
      setFormData(prev => ({ ...prev, tools_required: [...prev.tools_required, toolInput.trim()] }));
      setToolInput("");
    }
  };

  const handleRemoveTool = (tool) => {
    setFormData(prev => ({ ...prev, tools_required: prev.tools_required.filter(t => t !== tool) }));
  };
  
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const submitIdea = async (e) => {
    e.preventDefault();
    if (!formData.title) return toast.error("Idea Name is required");
    
    let finalImageUrl = formData.image_url;
    try {
      if (imageFile) {
        toast.loading("Uploading visual...", { id: "idea-upload" });
        const uploadData = new FormData();
        uploadData.append("file", imageFile);
        const res = await api.post("/api/files/upload", uploadData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        finalImageUrl = res.data.file_id;
        toast.success("Visual uploaded.", { id: "idea-upload" });
      }

      const payload = { ...formData, image_url: finalImageUrl };

      if (editData?.idea_id) {
         await api.put(`/api/war-room/ideas/${editData.idea_id}`, payload);
         toast.success("Idea Vault updated.");
      } else {
         await api.post("/api/war-room/ideas", payload);
         toast.success("Idea Vault captured and persisted to DB.");
      }
      onSuccess?.();
    } catch (err) {
      console.error("Submission error:", err);
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === "string" ? detail : (Array.isArray(detail) ? detail.map(d => `${d.loc.join(".")}: ${d.msg}`).join(", ") : "Failed to submit idea");
      toast.error(errorMsg, { id: "idea-upload" });
    }
  };

  return (
    <form onSubmit={submitIdea} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-zinc-700">Idea Name / Title</label>
          <input 
            name="title" value={formData.title || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="e.g. Next-Gen ERP System" required
          />
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-700">Monetization Type</label>
          <select 
            name="monetization_type" value={formData.monetization_type || "b2b_saas"} onChange={handleChange}
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
          >
            <option value="b2b_saas">B2B SaaS</option>
            <option value="b2c_subscription">B2C Subscription</option>
            <option value="one_time">One-Time License</option>
            <option value="marketplace">Marketplace Commission</option>
            <option value="open_source">Open Source Core</option>
            <option value="freemium">Freemium</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Revenue Model Description</label>
          <input 
            name="revenue_model" value={formData.revenue_model || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="e.g. Monthly subscription at $49/seat" required
          />
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Innovation Score (1-100)</label>
          <div className="flex items-center gap-4 mt-2">
            <input 
              type="range"
              min="1" max="100"
              name="innovation_score" value={formData.innovation_score || 50} onChange={handleChange}
              className="flex-1 accent-indigo-600"
            />
            <span className="text-sm font-bold text-indigo-600 w-8">{formData.innovation_score}</span>
          </div>
        </div>
        
        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700">Problem Statement</label>
          <textarea 
            name="problem_statement" value={formData.problem_statement || ""} onChange={handleChange}
            rows={3} className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="What exact pain point are we solving?" required
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700">Solution Overview</label>
          <textarea 
            name="solution_overview" value={formData.solution_overview || ""} onChange={handleChange}
            rows={3} className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="How does this idea resolve the problem statement?" required
          />
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Target Users</label>
          <input 
            name="target_users" value={formData.target_users || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="e.g. Enterprise HR Managers" required
          />
        </div>
        
        <div>
          <label className="text-xs font-bold text-zinc-700">Estimated Market Need</label>
          <input 
            name="estimated_market_need" value={formData.estimated_market_need || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="e.g. $2B TAM, High urgency" required
          />
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Business Risk</label>
          <select 
            name="business_risk_level" value={formData.business_risk_level || "Medium"} onChange={handleChange}
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
          >
            <option value="Low">Low Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="High">High Risk</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Priority Level</label>
          <select 
            name="priority_level" value={formData.priority_level || "Medium"} onChange={handleChange}
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
          >
            <option value="Low">Low Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="High">High Priority</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700 mb-1 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-zinc-500" />
            Attach Image / Visual (max 5MB)
          </label>
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileChange}
            className="w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer border border-zinc-200 rounded-xl p-2 bg-zinc-50"
          />
          {formData.image_url && !imageFile && (
            <p className="text-[10px] text-zinc-400 mt-2 italic">Current: {formData.image_url} (uploading new overwrites current)</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700">Tools / Tech Concept</label>
          <div className="flex items-center gap-2 mt-1">
            <input 
              value={toolInput} onChange={(e) => setToolInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleAddTool(e)}
              className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
              placeholder="e.g. Figma, Supabase, Next.js (Press Enter to add)"
            />
            <button type="button" onClick={handleAddTool} className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 px-3 py-2 rounded-xl transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {(formData.tools_required || []).map((tool, idx) => (
              <span key={idx} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                {tool}
                <button type="button" onClick={() => handleRemoveTool(tool)} className="hover:text-red-500 ml-1">&times;</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
        {editData && (
          <button type="button" onClick={onCancel} className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-700 px-5 py-2.5 rounded-xl font-bold hover:bg-zinc-50 transition-all text-sm">
            <X className="w-4 h-4" />
            Cancel
          </button>
        )}
        <button type="submit" className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm">
          <Save className="w-4 h-4" />
          {editData ? "Save Changes" : "Submit Idea"}
        </button>
      </div>
    </form>
  );
}
