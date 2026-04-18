import { useState, useEffect, useCallback } from "react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Lightbulb, Layers, 
  Map as RoadmapIcon, Plus, Bell, Activity, Edit2, Trash2, X
} from "lucide-react";

import IdeaVaultForm from "../components/warroom/IdeaVaultForm";
import ArchitectureForm from "../components/warroom/ArchitectureForm";
import RoadmapTimeline from "../components/warroom/RoadmapTimeline";

export default function WarRoomPage() {
  const { getWS, user } = useAuth();
  const [activeTab, setActiveTab] = useState("ideas");
  const [ideas, setIdeas] = useState([]);
  const [architectures, setArchitectures] = useState([]);
  const [roadmaps, setRoadmaps] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingDoc, setEditingDoc] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewingDocImageUrl, setViewingDocImageUrl] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "ideas") {
        const { data } = await api.get("/api/war-room/ideas");
        setIdeas(data);
      } else if (activeTab === "architecture") {
        const { data } = await api.get("/api/war-room/architectures");
        setArchitectures(data);
      } else {
        const { data } = await api.get("/api/war-room/roadmaps");
        setRoadmaps(data);
      }
    } catch {}
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
    setEditingDoc(null);
  }, [fetchData]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const i = await api.get("/api/war-room/ideas");
        setIdeas(i.data);
        const a = await api.get("/api/war-room/architectures");
        setArchitectures(a.data);
      } catch {}
    };
    fetchAll();
    
    const ws = getWS();
    if (!ws) return;
    
    const handleWs = (event) => {
        try {
            const data = JSON.parse(event.data);
            if(data.type === "war_room_feed_activity") {
                fetchData();
            }
        } catch {}
    };
    
    ws.addEventListener("message", handleWs);
    return () => ws.removeEventListener("message", handleWs);
  }, [fetchData, getWS]);

  useEffect(() => {
    if (viewingDoc?.image_url) {
      // Fetch the image using axios to ensure auth cookies are passed
      api.get(`/api/files/${viewingDoc.image_url}/download`, { responseType: 'blob' })
         .then(res => {
            const url = URL.createObjectURL(res.data);
            setViewingDocImageUrl(url);
         })
         .catch(err => console.error("Failed to load image", err));
    } else {
      setViewingDocImageUrl(null);
    }
    
    return () => {
      if (viewingDocImageUrl) {
         URL.revokeObjectURL(viewingDocImageUrl);
      }
    };
  }, [viewingDoc?.image_url]);

  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", 
      hour: "numeric", minute: "2-digit"
    });
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm("Are you sure you want to delete this specific record?")) return;
    try {
      if (type === "ideas") await api.delete(`/api/war-room/ideas/${id}`);
      else if (type === "architecture") await api.delete(`/api/war-room/architectures/${id}`);
      else await api.delete(`/api/war-room/roadmaps/${id}`);
      
      if (editingDoc?.id === id) setEditingDoc(null);
      fetchData();
    } catch (err) {
      alert("Failed to delete record.");
    }
  };

  const tabs = [
    { id: "ideas", label: "Idea Vault", icon: Lightbulb, description: "Raw founder ideas and validation" },
    { id: "architecture", label: "Architecture", icon: Layers, description: "System design & LLD/HLD" },
    { id: "roadmap", label: "Roadmap", icon: RoadmapIcon, description: "Long-term company goals" },
  ];

  const handleSuccess = () => {
    setEditingDoc(null);
    fetchData();
  };

  const handleCancelEdit = () => {
    setEditingDoc(null);
  };

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>Ideation Point</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Where raw strategy meets engineering execution.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Work Area */}
        <div className="lg:col-span-4 space-y-4">
            <div className="flex gap-1 p-1 bg-zinc-100/80 rounded-2xl w-fit">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${active ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Entry Form Component - Hidden for workers (read-only) */}
            {user.role !== "worker" && (
                <div className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-sm transition-all relative">
                    <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2 border-b border-zinc-100 pb-4 relative">
                        {editingDoc ? <Edit2 className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
                        {editingDoc ? `Edit ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Entry` : `New ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1, -1)} Entry`}
                    </h3>
                    
                    {activeTab === "ideas" && <IdeaVaultForm onSuccess={handleSuccess} onCancel={handleCancelEdit} editData={editingDoc} />}
                    {activeTab === "architecture" && <ArchitectureForm onSuccess={handleSuccess} onCancel={handleCancelEdit} availableIdeas={ideas} editData={editingDoc} />}
                    {activeTab === "roadmap" && <RoadmapTimeline onSuccess={handleSuccess} onCancel={handleCancelEdit} availableIdeas={ideas} availableArchs={architectures} editData={editingDoc} />}
                </div>
            )}

            {/* Historical Records List */}
            <div className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-sm mt-6">
                 <h3 className="text-sm font-bold text-zinc-900 mb-4">Historical {activeTab} Records</h3>
                 {loading ? (
                     <p className="text-xs text-zinc-400">Loading...</p>
                 ) : (
                     <div className="space-y-3">
                         {activeTab === 'ideas' && ideas.map(idea => (
                             <div key={idea.idea_id} onClick={() => setViewingDoc({...idea, type: 'ideas'})} className="p-4 bg-zinc-50 hover:bg-zinc-100 transition-colors rounded-xl flex justify-between items-center group cursor-pointer">
                                 <div>
                                     <p className="text-sm font-bold text-zinc-800">{idea.title}</p>
                                     <p className="text-xs text-zinc-500">Risk: {idea.business_risk_level} • Status: <span className="uppercase text-indigo-600 font-bold">{idea.status}</span> • Author: {idea.author_name}</p>
                                     {idea.created_at && <p className="text-[10px] text-zinc-400 mt-0.5">{formatDateTime(idea.created_at)}</p>}
                                 </div>
                                 <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {user.role !== "worker" && (
                                        <button onClick={(e) => { e.stopPropagation(); setEditingDoc({...idea, id: idea.idea_id}); }} className="p-2 text-zinc-400 hover:text-indigo-600 bg-white rounded-lg shadow-sm border border-zinc-200">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {user.role === "super_admin" && (
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(idea.idea_id, "ideas"); }} className="p-2 text-zinc-400 hover:text-red-600 bg-white rounded-lg shadow-sm border border-zinc-200">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                 </div>
                             </div>
                         ))}
                         {activeTab === 'architecture' && architectures.map(arch => (
                             <div key={arch.architecture_id} onClick={() => setViewingDoc({...arch, type: 'architecture'})} className="p-4 bg-zinc-50 hover:bg-zinc-100 transition-colors rounded-xl flex justify-between items-center group cursor-pointer">
                                 <div>
                                     <p className="text-sm font-bold text-zinc-800">{arch.title}</p>
                                     <p className="text-xs text-zinc-500">{arch.template_type} • DB: {arch.database_stack} • Author: {arch.author_name}</p>
                                     {arch.created_at && <p className="text-[10px] text-zinc-400 mt-0.5">{formatDateTime(arch.created_at)}</p>}
                                 </div>
                                 <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {user.role !== "worker" && (
                                        <button onClick={(e) => { e.stopPropagation(); setEditingDoc({...arch, id: arch.architecture_id}); }} className="p-2 text-zinc-400 hover:text-indigo-600 bg-white rounded-lg shadow-sm border border-zinc-200">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {user.role === "super_admin" && (
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(arch.architecture_id, "architecture"); }} className="p-2 text-zinc-400 hover:text-red-600 bg-white rounded-lg shadow-sm border border-zinc-200">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                 </div>
                             </div>
                         ))}
                         {activeTab === 'roadmap' && roadmaps.map(rm => (
                             <div key={rm.roadmap_id} onClick={() => setViewingDoc({...rm, type: 'roadmap'})} className="p-4 bg-zinc-50 hover:bg-zinc-100 transition-colors rounded-xl flex justify-between items-center group cursor-pointer">
                                 <div>
                                     <p className="text-sm font-bold text-zinc-800">{rm.title}</p>
                                     <p className="text-xs text-zinc-500">{rm.steps?.length || 0} Milestones • Author: {rm.author_name}</p>
                                     {rm.created_at && <p className="text-[10px] text-zinc-400 mt-0.5">{formatDateTime(rm.created_at)}</p>}
                                 </div>
                                 <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {user.role !== "worker" && (
                                        <button onClick={(e) => { e.stopPropagation(); setEditingDoc({...rm, id: rm.roadmap_id}); }} className="p-2 text-zinc-400 hover:text-indigo-600 bg-white rounded-lg shadow-sm border border-zinc-200">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {user.role === "super_admin" && (
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(rm.roadmap_id, "roadmap"); }} className="p-2 text-zinc-400 hover:text-red-600 bg-white rounded-lg shadow-sm border border-zinc-200">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
            </div>
        </div>
      </div>
      {/* Viewing details modal */}
      {viewingDoc && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 lg:p-8" onClick={() => setViewingDoc(null)}>
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-zinc-100">
                    <div>
                        <h2 className="text-xl font-bold text-zinc-950 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>{viewingDoc.title}</h2>
                        <p className="text-xs text-zinc-500 capitalize">
                            {viewingDoc.type.replace('_', ' ')} Record • Authored by {viewingDoc.author_name}
                            {viewingDoc.created_at && ` • ${formatDateTime(viewingDoc.created_at)}`}
                        </p>
                    </div>
                    <button onClick={() => setViewingDoc(null)} className="p-2 text-zinc-400 hover:text-zinc-800 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {viewingDocImageUrl && (
                        <div className="rounded-2xl overflow-hidden border border-zinc-100 bg-zinc-50 p-4 text-center">
                            <p className="text-xs font-bold text-zinc-400 mb-3 text-left">Attached Visual / Diagram</p>
                            <img 
                                src={viewingDocImageUrl} 
                                alt="Attachment" 
                                className="max-h-[300px] w-auto mx-auto rounded-lg shadow-sm border border-zinc-200" 
                            />
                        </div>
                    )}
                
                    {viewingDoc.type === 'ideas' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                                    <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Status</p>
                                    <p className="text-sm font-semibold text-indigo-600 uppercase">{viewingDoc.status}</p>
                                </div>
                                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                                    <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Risk Level</p>
                                    <p className="text-sm font-semibold text-zinc-900 capitalize">{viewingDoc.business_risk_level}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs uppercase font-bold text-zinc-500 mb-2">Description</p>
                                <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                                    {viewingDoc.description}
                                </div>
                            </div>
                        </div>
                    )}
                    {viewingDoc.type === 'architecture' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                                    <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Template</p>
                                    <p className="text-sm font-semibold text-zinc-900 capitalize">{viewingDoc.template_type?.replace('_', ' ')}</p>
                                </div>
                                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                                    <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Database</p>
                                    <p className="text-sm font-semibold text-zinc-900 capitalize">{viewingDoc.database_stack}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs uppercase font-bold text-zinc-500 mb-2">Infrastructure Layout / Markdown</p>
                                <div className="bg-zinc-950 p-4 rounded-xl text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed border border-zinc-800">
                                    {viewingDoc.content}
                                </div>
                            </div>
                        </div>
                    )}
                    {viewingDoc.type === 'roadmap' && (
                        <div className="space-y-4 text-sm text-zinc-800">
                            {viewingDoc.steps?.map((step, idx) => (
                                <div key={idx} className="flex gap-4 p-4 items-start bg-zinc-50 border border-zinc-100 rounded-xl relative">
                                    <div className="absolute top-1/2 -left-3 w-6 h-6 -translate-y-1/2 bg-indigo-600 text-white font-bold text-xs flex items-center justify-center ring-4 ring-white rounded-full">
                                        {idx + 1}
                                    </div>
                                    <div className="pl-4">
                                        <p className="font-bold text-zinc-900 mb-1">{step.title || `Milestone ${idx+1}`}</p>
                                        <p className="text-xs text-zinc-500">{step.description}</p>
                                        {step.estimated_days && <span className="inline-block mt-2 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold">{step.estimated_days} days estimated</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
