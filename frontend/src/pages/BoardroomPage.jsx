import { useState, useEffect } from "react";
import { 
  Building2, Users, Rocket, Activity, ChevronRight, LayoutDashboard, Plus
} from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import CreateProjectForm from "../components/controlroom/CreateProjectForm";
import ManageProjectDashboard from "../components/controlroom/ManageProjectDashboard";

export default function BoardroomPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [view, setView] = useState("overview"); // overview, create_project, manage_project

  const [loading, setLoading] = useState(true);



  useEffect(() => {
    fetchInitialData();
  }, [user]);

  const fetchInitialData = async () => {
    try {
      const [deptRes, usersRes] = await Promise.all([
        api.get("/api/departments"),
        api.get("/api/users")
      ]);
      const depts = deptRes.data;
      setDepartments(depts);
      setAllUsers(usersRes.data);

      if (depts.length > 0) {
        let defaultDept = depts[0];
        if (user?.role === "hod" || user?.role === "worker") {
           defaultDept = depts.find(d => d.department_id === user?.department_id) || depts[0];
        }
        setSelectedDepartment(defaultDept);
        fetchProjects(defaultDept.department_id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async (deptId) => {
    try {
      const { data } = await api.get(`/api/control-room/projects?department_id=${deptId}`);
      setProjects(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDepartmentClick = (dept) => {
    setSelectedDepartment(dept);
    setSelectedProject(null);
    setView("overview");
    fetchProjects(dept.department_id);
  };

  const handleProjectClick = (proj) => {
    setSelectedProject(proj);
    setView("manage_project");
  };

  const handleStatusChange = async (projectId, newStatus) => {
     try {
         await api.put(`/api/control-room/projects/${projectId}/status`, { status: newStatus });
         setProjects(projects.map(p => p.project_id === projectId ? { ...p, status: newStatus } : p));
         if(selectedProject?.project_id === projectId) {
             setSelectedProject({...selectedProject, status: newStatus});
         }
     } catch (e) {
         console.error(e);
     }
  };

  const handleDelete = (projectId) => {
    setProjects(projects.filter(p => p.project_id !== projectId));
    setSelectedProject(null);
    setView("overview");
  };

  const handleProjectCreated = (newProject) => {

     setView("overview");
  };

  // Add WebSocket hook effect to listen for "project_created" or "project_file_uploaded"
  useEffect(() => {
     const ws = user ? user.getWS?.() : null; // In real code, if getWS is not there, we'll just ignore
     if(!ws) return;
     const listener = (event) => {
        try {
           const msg = JSON.parse(event.data);
           
           if(msg.type === "project_created") {
              if(selectedDepartment && msg.project.department_id === selectedDepartment.department_id) {
                  setProjects(prev => {
                      if(prev.some(p => p.project_id === msg.project.project_id)) return prev;
                      return [msg.project, ...prev];
                  });
              }
           } else if(msg.type === "project_file_uploaded") {
              if(selectedProject && selectedProject.project_id === msg.file.project_id && view === "manage_project") {
                  // The sub-component handles its own fetching or we could pass context.
              }
           } else if(msg.type === "project_architecture_updated") {
              setProjects(prev => prev.map(p => p.project_id === msg.project.project_id ? msg.project : p));
              if (selectedProject && selectedProject.project_id === msg.project.project_id) {
                  setSelectedProject(msg.project);
              }
           }
        } catch(e){}
     };
     ws.addEventListener("message", listener);
     return () => ws.removeEventListener("message", listener);
  }, [user, selectedProject, selectedDepartment, view]);

  if (loading) return <div className="p-12 text-center text-zinc-400">Loading Control Room matrix...</div>;

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-white" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      
      {/* LEFT PANE: Department Control Layer */}
      <div className="w-full md:w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-zinc-200 bg-white shadow-sm flex items-center justify-between">
            <div>
               <h2 className="text-lg font-bold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Control Room</h2>
               <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Execution Matrix</p>
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <p className="text-xs font-bold text-zinc-400 mb-3 px-2 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" /> Department Tree
            </p>
            {departments.map((dept) => {
                const isActive = selectedDepartment?.department_id === dept.department_id;
                // Only render if super_admin OR user's dept
                if (user?.role !== "super_admin" && user?.department_id !== dept.department_id) return null;
                
                return (
                    <button
                        key={dept.department_id}
                        onClick={() => handleDepartmentClick(dept)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            isActive 
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" 
                                : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isActive ? "bg-white" : "bg-indigo-500"}`} />
                            {dept.name}
                        </span>
                        <ChevronRight className={`w-4 h-4 ${isActive ? "text-indigo-200" : "text-zinc-300"}`} />
                    </button>
                )
            })}
        </div>
      </div>

      {/* MIDDLE PANE: Project Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
         
         {/* Top Context Bar */}
         <div className="h-14 border-b border-zinc-200 flex items-center justify-between px-6 bg-white shrink-0">
            <div className="flex items-center gap-2 text-sm text-zinc-500 font-medium">
               <span>Departments</span>
               <ChevronRight className="w-4 h-4 text-zinc-300" />
               <span className="text-zinc-900 font-bold">{selectedDepartment?.name || "None Selected"}</span>
               {view !== "overview" && (
                   <>
                       <ChevronRight className="w-4 h-4 text-zinc-300" />
                       <span className="text-indigo-600 font-bold">
                           {view === "create_project" ? "Launch Initiative" : selectedProject?.project_id}
                       </span>
                   </>
               )}
            </div>
            
            {/* Context Actions */}
            <div className="flex gap-2">
                {(user?.role === "super_admin" || user?.role === "hod") && view !== "create_project" && (
                    <button 
                        onClick={() => setView("create_project")}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Assemble Project
                    </button>
                )}
                {view !== "overview" && (
                    <button 
                        onClick={() => setView("overview")}
                        className="px-4 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg"
                    >
                        Return to Matrix
                    </button>
                )}
            </div>
         </div>

         {/* Content Area Rendering */}
         <div className="flex-1 overflow-auto bg-zinc-50/30">
            {view === "overview" && (
                <div className="p-6 md:p-8">
                    <h2 className="text-2xl font-bold text-zinc-900 mb-6" style={{ fontFamily: "Outfit, sans-serif" }}>
                        {selectedDepartment?.name} Execution Pipeline
                    </h2>
                    
                    {projects.length === 0 ? (
                        <div className="bg-white border text-center border-dashed border-zinc-300 rounded-2xl p-12 flex flex-col items-center">
                            <Rocket className="w-12 h-12 text-zinc-300 mb-4" />
                            <h3 className="text-lg font-bold text-zinc-900">No Projects Assembly Line Active</h3>
                            <p className="text-zinc-500 text-sm mt-1 max-w-sm mb-6">Initiate a new project to start tracking architecture and trace codebases.</p>
                            {(user?.role === "super_admin" || user?.role === "hod") && (
                                <button onClick={() => setView("create_project")} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/30">
                                    Assemble Project
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {projects.map(proj => (
                                <div 
                                    key={proj.project_id} 
                                    onClick={() => handleProjectClick(proj)}
                                    className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded">{proj.project_id}</span>
                                            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-bold rounded">{proj.project_type}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            proj.status === "Deployed" ? "bg-emerald-50 text-emerald-600" :
                                            proj.status === "On Hold" ? "bg-amber-50 text-amber-600" :
                                            "bg-blue-50 text-blue-600"
                                        }`}>{proj.status}</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors" style={{ fontFamily: "Outfit, sans-serif" }}>{proj.name}</h3>
                                    <p className="text-sm text-zinc-500 line-clamp-2 mt-1">{proj.description}</p>
                                    
                                    <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-xs font-medium text-zinc-400">
                                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {proj.members.length} team</span>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-800 bg-zinc-100 px-2 py-1 rounded">Due: {new Date(proj.deadline).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {view === "create_project" && (
                <CreateProjectForm 
                    departments={departments} 
                    allUsers={allUsers}
                    onProjectCreated={handleProjectCreated} 
                />
            )}

            {view === "manage_project" && (
                <ManageProjectDashboard 
                     project={selectedProject} 
                     departmentId={selectedDepartment.department_id}
                     onStatusChange={handleStatusChange}
                     onDelete={handleDelete}
                />
            )}
         </div>

      </div>

    </div>
  );
}
