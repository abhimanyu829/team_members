import React, { useState, useEffect } from "react";
import api from "@/utils/api";
import { Save, Plus, Target, Trash2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function RoadmapTimeline({ onSuccess, onCancel, availableIdeas = [], availableArchs = [], editData }) {
  const [formData, setFormData] = useState({
    idea_id: "",
    architecture_id: "",
    title: "",
    image_url: ""
  });
  
  const [steps, setSteps] = useState([
    { id: `step-${Math.random().toString(36).substr(2, 9)}`, milestone_name: "Phase 1: Setup", owner: "", department_id: "", budget: 0, start_date: "", end_date: "", status: "Pending" }
  ]);
  
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    if (editData) {
      const { id, _id, author_id, author_name, created_at, updated_at, status, steps: es, ...rest } = editData;
      setFormData({ ...rest, image_url: rest.image_url || "" });
      setImageFile(null);
      if (es && es.length > 0) {
        setSteps(es.map(s => ({ ...s, id: s.id || `step-${Math.random().toString(36).substr(2, 9)}` })));
      }
    } else {
      setFormData({
        idea_id: "",
        architecture_id: "",
        title: "",
        image_url: ""
      });
      setImageFile(null);
      setSteps([
        { id: `step-${Math.random().toString(36).substr(2, 9)}`, milestone_name: "Phase 1: Setup", owner: "", department_id: "", budget: 0, start_date: "", end_date: "", status: "Pending" }
      ]);
    }
  }, [editData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const addStep = (e) => {
    e.preventDefault();
    setSteps([...steps, { id: `step-${Math.random().toString(36).substr(2, 9)}`, milestone_name: "", owner: "", department_id: "", budget: 0, start_date: "", end_date: "", status: "Pending" }]);
  };

  const updateStep = (id, field, value) => {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  
  const removeStep = (id) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const submitRoadmap = async (e) => {
    e.preventDefault();
    if (!formData.title) return toast.error("Title is required");
    if (!formData.idea_id) return toast.error("Please explicitly link to an Idea");
    
    let finalImageUrl = formData.image_url;
    try {
      if (imageFile) {
        const uploadData = new FormData();
        uploadData.append("file", imageFile);
        const res = await api.post("/api/files/upload", uploadData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        finalImageUrl = res.data.file_id;
      }

      const payload = { ...formData, image_url: finalImageUrl, steps };

      if (editData?.roadmap_id) {
        await api.put(`/api/war-room/roadmaps/${editData.roadmap_id}`, payload);
        toast.success("Roadmap Execution Plan Updated");
      } else {
        await api.post("/api/war-room/roadmaps", payload);
        toast.success("Roadmap Execution Plan Active");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save roadmap");
    }
  };

  return (
    <form onSubmit={submitRoadmap} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-zinc-700">Link to Approved Idea</label>
          <select 
            name="idea_id" value={formData.idea_id || ""} onChange={handleChange}
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-indigo-700" 
            required
          >
            <option value="">-- Select Linked Idea --</option>
            {availableIdeas.map(idea => (
              <option key={idea.idea_id} value={idea.idea_id}>{idea.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Link to Architecture (Opt)</label>
          <select 
            name="architecture_id" value={formData.architecture_id || ""} onChange={handleChange}
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
          >
            <option value="">-- None --</option>
            {availableArchs.map(arch => (
              <option key={arch.architecture_id} value={arch.architecture_id}>{arch.title}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700">Roadmap / Sprint Name</label>
          <input 
            name="title" value={formData.title || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="e.g. Q3 MVP Launch Timeline" required
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700 mb-1 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-zinc-500" />
            Attach Gantt/Timeline Image (max 5MB)
          </label>
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileChange}
            className="w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer border border-zinc-200 rounded-xl p-2 bg-zinc-50"
          />
          {formData.image_url && !imageFile && (
            <p className="text-[10px] text-zinc-400 mt-2 italic">Current Upload: {formData.image_url} (uploading new overwrites current)</p>
          )}
        </div>
      </div>

      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 relative overflow-hidden">
        {/* Visual Line */}
        <div className="absolute left-6 top-16 bottom-4 w-0.5 bg-indigo-200 z-0 hidden md:block"></div>

        <div className="flex justify-between items-center mb-6 relative z-10">
          <h4 className="text-sm font-bold text-zinc-900">Milestone Builder</h4>
          <button type="button" onClick={addStep} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Add Milestone
          </button>
        </div>

        <div className="space-y-4 relative z-10">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm relative ml-0 md:ml-10">
              <div className="absolute -left-12 top-4 w-6 h-6 bg-indigo-600 text-white rounded-full hidden md:flex items-center justify-center text-xs font-bold ring-4 ring-zinc-50">
                {idx + 1}
              </div>
              
              <div className="flex-1 space-y-3">
                <div className="flex justify-between">
                  <input 
                    value={step.milestone_name || ""} onChange={(e) => updateStep(step.id, 'milestone_name', e.target.value)}
                    className="flex-1 text-sm font-bold bg-transparent border-none focus:ring-0 text-zinc-900 p-0 placeholder-zinc-400"
                    placeholder="Milestone Name (e.g. Database Design)" required
                  />
                  <button type="button" onClick={() => removeStep(step.id)} className="text-zinc-300 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Start Date</label>
                    <input type="date" value={step.start_date || ""} onChange={(e) => updateStep(step.id, 'start_date', e.target.value)} className="w-full text-xs px-2 py-1.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Deadline</label>
                    <input type="date" value={step.end_date || ""} onChange={(e) => updateStep(step.id, 'end_date', e.target.value)} className="w-full text-xs px-2 py-1.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Budget Allocation</label>
                    <div className="relative mt-0.5">
                      <span className="absolute left-2 top-1.5 text-xs text-zinc-500">$</span>
                      <input type="number" value={step.budget || 0} onChange={(e) => updateStep(step.id, 'budget', parseFloat(e.target.value))} className="w-full pl-6 pr-2 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Status</label>
                    <select value={step.status || "Pending"} onChange={(e) => updateStep(step.id, 'status', e.target.value)} className="w-full text-xs px-2 py-1.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded">
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                      <option>Delayed</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
          <Target className="w-4 h-4" />
          {editData ? "Save Roadmap" : "Deploy Roadmap"}
        </button>
      </div>
    </form>
  );
}
