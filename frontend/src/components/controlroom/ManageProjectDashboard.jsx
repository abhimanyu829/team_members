import { useState, useEffect } from "react";
import { 
  BarChart, Users, AlertCircle, HardDrive, Layout, Waypoints, Target, Info, Edit2, UploadCloud, Check, X, Loader2, Activity, Trash2
} from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import FileTraceabilityPanel from "./FileTraceabilityPanel";

export default function ManageProjectDashboard({ project, departmentId, onStatusChange, onDelete }) {
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState("architecture"); // 'architecture' or 'traceability'
  const [isEditingArch, setIsEditingArch] = useState(false);
  const [archImageFile, setArchImageFile] = useState(null);
  const [roadmapDesc, setRoadmapDesc] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");
  const [savingArch, setSavingArch] = useState(false);
  const [archImageUrl, setArchImageUrl] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null); // null = latest
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [archContentType, setArchContentType] = useState("");
  
  useEffect(() => {
     if(project) {
        setRoadmapDesc(project.roadmap_description || "");
        setIsEditingArch(false);
        setArchImageFile(null);
        setUpdateNotes("");
        setSelectedVersion(null);
     }
  }, [project?.project_id, project?.roadmap_description]);

  useEffect(() => {
    let targetFileId = project?.architecture_diagram;
    if (selectedVersion) {
        targetFileId = selectedVersion.architecture_diagram;
    }

    if (targetFileId) {
       api.get(`/api/files/${targetFileId}/download`, { responseType: 'blob' })
          .then(res => {
              setArchContentType(res.data.type);
              setArchImageUrl(URL.createObjectURL(res.data));
          })
          .catch(err => console.error(err));
    } else {
       setArchImageUrl(null);
       setArchContentType("");
    }
  }, [project?.architecture_diagram, selectedVersion]);

  const handleSaveArchitecture = async () => {
      setSavingArch(true);
      try {
          let updatedImageId = project.architecture_diagram;
          
          if(archImageFile) {
              const formData = new FormData();
              formData.append("file", archImageFile);
              const fileRes = await api.post("/api/files/upload", formData, {
                 headers: { "Content-Type": "multipart/form-data" }
              });
              updatedImageId = fileRes.data.file_id;
          }
          
          await api.put(`/api/control-room/projects/${project.project_id}/architecture`, {
              architecture_diagram: updatedImageId,
              roadmap_description: roadmapDesc,
              update_notes: updateNotes
          });
          
          setIsEditingArch(false);
          setArchImageFile(null);
          setUpdateNotes("");
      } catch (err){
          alert("Failed to save architecture");
      } finally {
          setSavingArch(false);
      }
  };

  const handleDeleteProject = async () => {
      if (!window.confirm("Are you sure you want to permanently delete this project? This will remove all associated architecture traces and activity records.")) return;
      
      try {
          await api.delete(`/api/control-room/projects/${project.project_id}`);
          if (onDelete) onDelete(project.project_id);
      } catch (err) {
          console.error(err);
          alert("Failed to delete project. Please ensure you have super_admin privileges.");
      }
  };
  
  if (!project) return (
    <div className="flex items-center justify-center h-full text-zinc-400">
      <div className="text-center">
        <Layout className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Select a project to manage.</p>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header Info */}
      <div className="bg-white p-6 flex items-start justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded tracking-widest">{project.project_id}</span>
            <span className={`px-2 py-1 font-bold text-[10px] rounded tracking-widest ${
                project.status === "In Progress" ? "bg-amber-100 text-amber-700" :
                project.status === "Deployed" ? "bg-emerald-100 text-emerald-700" :
                "bg-zinc-100 text-zinc-700"
            }`}>{project.status}</span>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>{project.name}</h2>
          <p className="text-sm text-zinc-500 max-w-2xl mt-1">{project.description}</p>
        </div>
        
        {/* Execution Pipeline Controls */}
        <div className="flex gap-2">
            {(user.role === "super_admin" || user.role === "hod") && (
                <select 
                    value={project.status} 
                    onChange={(e) => onStatusChange(project.project_id, e.target.value)}
                    className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option>In Progress</option>
                    <option>On Hold</option>
                    <option>Deployed</option>
                    <option>Failed</option>
                </select>
            )}
            
            {user.role === "super_admin" && (
                <button 
                    onClick={handleDeleteProject}
                    className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200 shadow-sm transition-colors group flex items-center gap-2"
                    title="Terminate Project"
                >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs font-bold">Terminate</span>
                </button>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-zinc-200 px-6 pt-2 flex items-center gap-6 shrink-0">
        <button 
          onClick={() => setActiveTab("architecture")}
          className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "architecture" 
              ? "border-indigo-600 text-indigo-600" 
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <Waypoints className="w-4 h-4" />
          Architecture & Roadmap
        </button>
        <button 
          onClick={() => setActiveTab("traceability")}
          className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "traceability" 
              ? "border-indigo-600 text-indigo-600" 
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <Target className="w-4 h-4" />
          Asset Traceability Pipeline
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-zinc-50/50">
        
        {activeTab === "architecture" && (
          <div className="p-6 space-y-6 w-full max-w-7xl mx-auto">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col items-center text-center justify-center">
                   <Target className="w-5 h-5 text-indigo-500 mb-2" />
                   <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Type</span>
                   <span className="text-zinc-900 font-semibold">{project.project_type}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col items-center text-center justify-center">
                   <Info className="w-5 h-5 text-emerald-500 mb-2" />
                   <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Target</span>
                   <span className="text-zinc-900 font-semibold">{project.client_internal}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col items-center text-center justify-center">
                   <AlertCircle className="w-5 h-5 text-rose-500 mb-2" />
                   <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Risk</span>
                   <span className="text-zinc-900 font-semibold">{project.risk_level}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col items-center text-center justify-center">
                   <Users className="w-5 h-5 text-amber-500 mb-2" />
                   <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Team</span>
                   <span className="text-zinc-900 font-semibold">{project.members.length} locked</span>
               </div>
            </div>

            {/* Architecture Block */}
            <div className="bg-zinc-900 rounded-2xl shadow-lg border border-zinc-800 overflow-hidden">
               <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Waypoints className="w-5 h-5 text-indigo-400" />
                     <h3 className="font-bold text-white">System Architecture & Roadmap Flow</h3>
                     {selectedVersion && (
                         <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded border border-amber-500/30 uppercase">
                             Viewing Version {selectedVersion.version}
                         </span>
                     )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowHistory(!showHistory)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showHistory ? 'bg-indigo-600 text-white' : 'bg-white/5 hover:bg-white/10 text-zinc-300'}`}
                    >
                        <Activity className="w-3.5 h-3.5" /> {showHistory ? 'Hide History' : 'Version History'}
                    </button>
                    {(user.role === "super_admin" || user.role === "hod") && !isEditingArch && (
                        <button onClick={() => setIsEditingArch(true)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                            <Edit2 className="w-3.5 h-3.5" /> Edit Diagram
                        </button>
                    )}
                    {isEditingArch && (
                        <div className="flex gap-2">
                            <button onClick={() => setIsEditingArch(false)} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                                <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                            <button onClick={handleSaveArchitecture} disabled={savingArch} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                                {savingArch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Save Changes
                            </button>
                        </div>
                    )}
                  </div>
               </div>
               
               {showHistory && (
                   <div className="bg-zinc-800/50 border-b border-zinc-800 p-4 overflow-x-auto">
                       <div className="flex gap-3">
                           <button 
                                onClick={() => setSelectedVersion(null)}
                                className={`flex-shrink-0 px-5 py-3 rounded-xl text-xs font-black transition-all border shadow-sm ${
                                  !selectedVersion 
                                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/20' 
                                    : 'bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600'
                                }`}
                           >
                                Latest Configuration
                           </button>
                           {[...(project.architecture_history || [])].reverse().map((ver, idx) => (
                               <button 
                                    key={idx}
                                    onClick={() => setSelectedVersion(ver)}
                                    className={`flex-shrink-0 text-left p-3 rounded-xl border transition-all ${
                                      selectedVersion?.version === ver.version 
                                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20' 
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600'
                                    }`}
                               >
                                   <div className="flex items-center justify-between gap-6 mb-2">
                                       <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                         selectedVersion?.version === ver.version ? 'bg-white/20' : 'bg-zinc-900/50 text-indigo-400'
                                       }`}>V{ver.version}</span>
                                       <span className="text-[10px] font-bold opacity-60">{new Date(ver.updated_at).toLocaleDateString()}</span>
                                   </div>
                                   <p className={`text-[11px] font-bold truncate max-w-[140px] ${
                                     selectedVersion?.version === ver.version ? 'text-white' : 'text-zinc-100'
                                   }`}>
                                     {ver.update_notes || 'Iteration Snapshot'}
                                   </p>
                                   <p className="text-[9px] font-medium opacity-50 mt-1 flex items-center gap-1">
                                     <Users className="w-2.5 h-2.5" /> {ver.updated_by_name}
                                   </p>
                               </button>
                           ))}
                       </div>
                   </div>
               )}
               
               <div className={`p-6 ${isEditingArch ? 'bg-zinc-900' : 'bg-zinc-950'} flex flex-col items-center justify-center border-b border-zinc-800 min-h-[300px]`}>
                  {isEditingArch ? (
                       <div className="w-full max-w-2xl bg-zinc-800 p-8 rounded-2xl border border-zinc-700 text-center border-dashed relative group">
                           <input 
                               type="file" 
                               id="arch-upload" 
                               className="hidden" 
                               accept=".png,.jpg,.jpeg,.webp,.pdf"
                               onChange={(e) => setArchImageFile(e.target.files[0])}
                           />
                           
                           {archImageFile || project?.architecture_diagram ? (
                               <div className="flex flex-col items-center">
                                   <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 border border-indigo-500/20">
                                       <Layout className="w-8 h-8 text-indigo-400" />
                                   </div>
                                   <p className="text-sm font-bold text-white mb-1">
                                       {archImageFile ? archImageFile.name : "Current diagram is active"}
                                   </p>
                                   <p className="text-xs text-zinc-400 mb-6 font-medium">
                                       {archImageFile ? "Replacement selection staged" : "Securely stored in project repository"}
                                   </p>
                                   
                                   <div className="flex items-center gap-3 justify-center">
                                       <label htmlFor="arch-upload" className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all active:scale-95 shadow-lg">
                                           Change File
                                       </label>
                                       <button 
                                           onClick={() => {
                                               if (archImageFile) setArchImageFile(null);
                                               else if (window.confirm("Are you sure you want to permanently delete the current architecture diagram? This will create a new history version with no diagram.")) {
                                                  api.put(`/api/control-room/projects/${project.project_id}/architecture`, {
                                                      architecture_diagram: null,
                                                      roadmap_description: roadmapDesc,
                                                      update_notes: "System Architecture trace manually removed."
                                                  }).then(() => {
                                                      setIsEditingArch(false);
                                                      onStatusChange(); // Trigger refresh
                                                  });
                                               }
                                           }}
                                           className="px-6 py-2.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white text-[11px] font-black uppercase tracking-wider rounded-xl border border-rose-500/20 transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-rose-500/5"
                                       >
                                           <Trash2 className="w-4 h-4" />
                                           {archImageFile ? "Discard Selection" : "Delete Current"}
                                       </button>
                                   </div>
                               </div>
                           ) : (
                               <label htmlFor="arch-upload" className="cursor-pointer flex flex-col items-center justify-center py-6">
                                   <UploadCloud className="w-14 h-14 text-indigo-400 mb-4 stroke-[1.5px]" />
                                   <p className="text-sm font-bold text-zinc-200 mb-1">
                                       Select new architecture diagram
                                   </p>
                                   <p className="text-xs text-zinc-500 font-medium">
                                       Seamlessly supports .png, .jpg, .webp, and .pdf specifications
                                   </p>
                               </label>
                           )}
                       </div>
                  ) : (
                       archImageUrl ? (
                          <div 
                            className="w-full max-w-4xl mx-auto rounded-lg overflow-hidden border border-zinc-800/50 bg-black/50 p-4 transition-all hover:ring-2 hover:ring-indigo-500/50 cursor-pointer relative group"
                            onClick={() => setIsFullScreen(true)}
                          >
                              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs z-10">
                                  Click to Expand
                              </div>
                              {archContentType === "application/pdf" ? (
                                  <div className="bg-zinc-900 rounded border border-zinc-800 flex flex-col items-center justify-center py-12 px-6 text-center">
                                      <HardDrive className="w-16 h-16 text-indigo-500 mb-4" />
                                      <p className="text-white font-bold text-lg mb-2">Architecture PDF Loaded</p>
                                      <p className="text-zinc-400 text-sm mb-6">PDF files must be expanded for full interactive viewing.</p>
                                      <div className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg transition-transform active:scale-95">
                                          View Full Screen Trace
                                      </div>
                                  </div>
                              ) : (
                                  <img src={archImageUrl} alt="System Architecture Diagram" className="w-full h-auto object-contain max-h-[600px] mx-auto" />
                              )}
                          </div>
                      ) : (
                          <div className="flex flex-col items-center justify-center text-zinc-500 py-10">
                             <HardDrive className="w-12 h-12 mb-3 opacity-20" />
                             <span className="text-sm font-semibold">No architecture diagram uploaded yet.</span>
                             <span className="text-xs opacity-60">Supported: Upload LLM exports, Mermaid, Draw.io images, or PDF specs.</span>
                          </div>
                      )
                  )}
               </div>
               
               <div className="p-6 text-sm text-zinc-300">
                  <p className="font-bold text-white mb-3 flex items-center justify-between">
                      Roadmap Strategy
                      {selectedVersion && <span className="text-[10px] text-zinc-500 italic font-normal">History snapshot from {new Date(selectedVersion.updated_at).toLocaleString()}</span>}
                  </p>
                  {isEditingArch ? (
                      <div className="space-y-4">
                        <textarea
                            value={roadmapDesc}
                            onChange={(e) => setRoadmapDesc(e.target.value)}
                            placeholder="Describe the overall execution roadmap..."
                            className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-xl p-4 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-zinc-600 resize-none"
                        />
                        <div className="bg-zinc-800 rounded-xl border border-zinc-700 p-4">
                            <p className="text-xs font-bold text-indigo-400 mb-2 flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5" /> What's updated in this version?
                            </p>
                            <input 
                                type="text"
                                value={updateNotes}
                                onChange={(e) => setUpdateNotes(e.target.value)}
                                placeholder="E.g., Added authentication block, refined database schema..."
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                      </div>
                  ) : (
                      <div className="whitespace-pre-wrap leading-relaxed bg-zinc-950/50 p-6 rounded-xl border border-zinc-800/50 text-zinc-300 min-h-[100px] shadow-inner">
                        {selectedVersion ? selectedVersion.roadmap_description : (project.roadmap_description || "No roadmap strategy documented for this configuration yet.") }
                      </div>
                  )}
               </div>
            </div>
          </div>
        )}

        {activeTab === "traceability" && (
          <div className="p-6 h-full flex flex-col w-full max-w-7xl mx-auto">
              <div className="flex-1 min-h-[500px]">
                  <FileTraceabilityPanel project={project} departmentId={departmentId} />
              </div>
          </div>
        )}

      </div>

      {/* FULL SCREEN MODAL OVERLAY */}
      {isFullScreen && archImageUrl && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col p-4 md:p-10">
              <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-4">
                      <Waypoints className="w-8 h-8 text-indigo-500" />
                      <div>
                          <h2 className="text-2xl font-bold text-white leading-none mb-1">{project.name}</h2>
                          <p className="text-zinc-400 text-sm">System Architecture & Roadmap Trace (V{selectedVersion?.version || (project.architecture_history?.length || 0) + 1})</p>
                      </div>
                  </div>
                  <button 
                      onClick={() => setIsFullScreen(false)}
                      className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/5 active:scale-90"
                  >
                      <X className="w-8 h-8" />
                  </button>
              </div>

              <div className="flex-1 bg-zinc-900 rounded-2xl border border-white/5 overflow-hidden shadow-2xl relative">
                  {archContentType === "application/pdf" ? (
                      <object
                          data={archImageUrl}
                          type="application/pdf"
                          className="w-full h-full"
                      >
                          <div className="flex flex-col items-center justify-center h-full text-white p-10 text-center">
                              <AlertCircle className="w-16 h-16 text-rose-500 mb-4" />
                              <p className="text-xl font-bold mb-2">Internal PDF Render Failed</p>
                              <p className="text-zinc-400 max-w-md">Your browser does not support inline PDF viewing. Please download the file to view its contents.</p>
                              <a 
                                href={archImageUrl} 
                                download={`${project.name}_Architecture.pdf`}
                                className="mt-6 px-8 py-3 bg-indigo-600 rounded-xl font-bold shadow-lg"
                              >
                                Download Architecture Spec
                              </a>
                          </div>
                      </object>
                  ) : (
                      <div className="w-full h-full flex items-center justify-center overflow-auto bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:20px_20px]">
                          <img 
                              src={archImageUrl} 
                              alt="Full size architecture" 
                              className="max-w-none w-auto h-auto max-h-[300%] md:max-h-full object-contain cursor-move" 
                              draggable="false"
                          />
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  )
}
