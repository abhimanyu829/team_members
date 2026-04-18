import React, { useState, useEffect } from "react";
import api from "@/utils/api";
import { Save, Plus, GripVertical, Trash2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableBlock({ id, block, updateBlock, removeBlock }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-start bg-white p-3 rounded-xl border border-zinc-200 shadow-sm mb-2 group">
      <div {...attributes} {...listeners} className="mt-2 text-zinc-400 hover:text-zinc-600 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <input 
          value={block.type} onChange={(e) => updateBlock(id, 'type', e.target.value)}
          className="w-full text-xs font-bold bg-transparent border-none focus:ring-0 text-indigo-600 mb-1"
          placeholder="Module Name (e.g. Auth Service)"
        />
        <textarea
          value={block.content} onChange={(e) => updateBlock(id, 'content', e.target.value)}
          className="w-full text-sm bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2"
          placeholder="Describe implementation logic..."
          rows={2}
        />
      </div>
      <button type="button" onClick={() => removeBlock(id)} className="text-zinc-300 hover:text-red-500 transition-colors p-2 mt-1">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ArchitectureForm({ onSuccess, onCancel, availableIdeas = [], editData }) {
  const [formData, setFormData] = useState({
    idea_id: "",
    title: "",
    template_type: "Web Development",
    frontend_stack: "React",
    backend_stack: "Node.js",
    database_stack: "PostgreSQL",
    cloud_provider: "AWS",
    image_url: ""
  });
  
  const [blocks, setBlocks] = useState([
    { id: "block-1", type: "Frontend Module", content: "Implement UI pages." }
  ]);
  
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    if (editData) {
      const { id, _id, author_id, author_name, created_at, updated_at, status, blocks: eb, ...rest } = editData;
      setFormData({ ...rest, image_url: rest.image_url || "" });
      setImageFile(null);
      if (eb && eb.length > 0) {
        setBlocks(eb.map(b => ({ ...b, id: b.id || `block-${Math.random().toString(36).substr(2, 9)}` })));
      }
    } else {
      setFormData({
        idea_id: "",
        title: "",
        template_type: "Web Development",
        frontend_stack: "React",
        backend_stack: "Node.js",
        database_stack: "PostgreSQL",
        cloud_provider: "AWS",
        image_url: ""
      });
      setImageFile(null);
      setBlocks([
        { id: "block-1", type: "Frontend Module", content: "Implement UI pages." }
      ]);
    }
  }, [editData]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addBlock = (e) => {
    e.preventDefault();
    setBlocks([...blocks, { id: `block-${Math.random().toString(36).substr(2, 9)}`, type: "New Engine", content: "" }]);
  };

  const updateBlock = (id, field, value) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, [field]: value } : b));
  };
  
  const removeBlock = (id) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const submitArchitecture = async (e) => {
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

      const payload = { ...formData, image_url: finalImageUrl, blocks };

      if (editData?.architecture_id) {
        await api.put(`/api/war-room/architectures/${editData.architecture_id}`, payload);
        toast.success("Tech Architecture Updated");
      } else {
        await api.post("/api/war-room/architectures", payload);
        toast.success("Tech Architecture Persisted");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit architecture");
    }
  };

  return (
    <form onSubmit={submitArchitecture} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
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
          <label className="text-xs font-bold text-zinc-700">Architecture Title</label>
          <input 
            name="title" value={formData.title || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
            placeholder="e.g. LLD for Core Aggregator" required
          />
        </div>
        
        <div>
          <label className="text-xs font-bold text-zinc-700">Architecture Type</label>
          <select 
            name="template_type" value={formData.template_type || "Web Development"} onChange={handleChange}
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
          >
            <option>Web Development</option>
            <option>SaaS</option>
            <option>AI Model Pipeline</option>
            <option>Mobile App</option>
            <option>Agentic AI Workflow</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700">Frontend</label>
          <input 
            name="frontend_stack" value={formData.frontend_stack || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
          />
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-700">Backend</label>
          <input 
            name="backend_stack" value={formData.backend_stack || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
          />
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-700">Database</label>
          <input 
            name="database_stack" value={formData.database_stack || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
          />
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-700">Cloud Infra</label>
          <input 
            name="cloud_provider" value={formData.cloud_provider || ""} onChange={handleChange} 
            className="w-full mt-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" 
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-bold text-zinc-700 mb-1 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-zinc-500" />
            Attach Diagram / Logic Flow (max 5MB)
          </label>
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileChange}
            className="w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer border border-zinc-200 rounded-xl p-2 bg-zinc-50"
          />
          {formData.image_url && !imageFile && (
            <p className="text-[10px] text-zinc-400 mt-2 italic">Current Diagram: {formData.image_url} (uploading new overwrites current)</p>
          )}
        </div>
      </div>

      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-bold text-zinc-900">Execution Block Planner</h4>
          <button type="button" onClick={addBlock} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Block
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((block) => (
              <SortableBlock key={block.id} id={block.id} block={block} updateBlock={updateBlock} removeBlock={removeBlock} />
            ))}
          </SortableContext>
        </DndContext>
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
          {editData ? "Save Architecture" : "Submit Architecture"}
        </button>
      </div>
    </form>
  );
}
