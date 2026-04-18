import React, { useState, useEffect } from "react";
import { 
  Box, 
  Layers, 
  Share2, 
  Clock, 
  User, 
  Calendar, 
  Maximize2, 
  FileText, 
  Image as ImageIcon, 
  ChevronRight,
  Filter,
  Search,
  CheckCircle2,
  Clock3
} from "lucide-react";
import AssetPreviewModal from "./AssetPreviewModal";
import api from "@/utils/api";

function getFileIcon(mime = "", filename = "") {
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  if (mime?.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext)) {
    return <ImageIcon className="w-6 h-6" />;
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return <FileText className="w-6 h-6" />;
  }
  return <Box className="w-6 h-6" />;
}

const ARCH_CATEGORIES = [
  "All",
  "Block Architecture",
  "System Flow",
  "Deployment Flow",
  "Sequence Logic",
  "Notebook LLM Diagram",
  "Flowchart",
];

export default function ArchitectureGallery({ projectId }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [previewAsset, setPreviewAsset] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (projectId) fetchArchitectureAssets();
  }, [projectId]);

  const fetchArchitectureAssets = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/assets/architecture/${projectId}`);
      setAssets(data.architecture_assets || []);
    } catch (e) {
      console.error("Failed to load architecture assets", e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = assets.filter((a) => {
    const matchesCat = activeCategory === "All" || a.file_category === activeCategory;
    const matchesSearch = a.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          a.sender_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-zinc-500 font-bold text-sm tracking-widest uppercase">Initializing Canvas...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50/30 font-['IBM_Plex_Sans'] overflow-hidden">
      {/* Search & Tabs Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-zinc-200 px-8 py-4 space-y-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200">
               <Layers size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-zinc-900 tracking-tight">Architecture Vault</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">System Model Traceability</p>
            </div>
          </div>
          
          <div className="flex-1 max-w-md relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
            <input 
              type="text"
              placeholder="Filter by name, author, or module..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-zinc-100 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-zinc-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
          {ARCH_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                activeCategory === cat 
                  ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" 
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
              {cat !== "All" && assets.filter((a) => a.file_category === cat).length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-lg text-[10px] ${activeCategory === cat ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'}`}>
                  {assets.filter((a) => a.file_category === cat).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
            <div className="w-20 h-20 bg-zinc-100 rounded-3xl flex items-center justify-center mb-6 text-zinc-300">
              <Filter size={40} />
            </div>
            <h3 className="text-zinc-900 font-bold text-lg">No Blueprints Found</h3>
            <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
              We couldn't find any architecture assets matching your current filters. Try adjusting your search or category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((asset) => (
              <ArchGalleryCard key={asset.file_id} asset={asset} onClick={() => setPreviewAsset(asset)} />
            ))}
          </div>
        )}
      </div>

      {previewAsset && (
        <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
    </div>
  );
}

function ArchGalleryCard({ asset, onClick }) {
  const ext = (asset.file_name || "").split(".").pop()?.toLowerCase();
  const isImage = asset.mime_type?.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext);

  return (
    <div 
      className="group bg-white border border-zinc-200 rounded-[2rem] p-3 hover:border-indigo-600/30 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 cursor-pointer relative overflow-hidden"
      onClick={onClick}
    >
      {/* Image Preview / Icon Placeholder */}
      <div className="aspect-[4/3] rounded-[1.5rem] bg-zinc-50 overflow-hidden relative border border-zinc-100">
        {isImage && asset.signed_download_url ? (
          <img 
            src={asset.signed_download_url} 
            alt={asset.file_name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-50 text-zinc-300">
            <div className="p-4 bg-white rounded-2xl shadow-sm">
              {getFileIcon(asset.mime_type, asset.file_name)}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">{ext || "unkn"}</span>
          </div>
        )}
        
        {/* Badges Overlay */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 transition-transform duration-500 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
            <div className="px-3 py-1 bg-white/90 backdrop-blur-md text-[10px] font-black text-zinc-900 rounded-full shadow-sm flex items-center gap-1.5 uppercase">
                <Box size={12} className="text-indigo-600" />
                {asset.file_category}
            </div>
        </div>

        <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors duration-500 flex items-center justify-center">
            <div className="w-12 h-12 bg-white text-zinc-900 rounded-full flex items-center justify-center shadow-xl translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                <Maximize2 size={20} />
            </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-4 px-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-sm font-bold text-zinc-900 truncate flex-1 tracking-tight" title={asset.file_name}>
            {asset.file_name}
          </h4>
          <span className="text-[10px] font-black bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-lg shrink-0">v{asset.version || 1}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-zinc-50">
           <div className="flex items-center gap-1.5 min-w-0">
             <div className="w-5 h-5 bg-zinc-100 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-600 shrink-0">
                {asset.sender_name?.charAt(0) || "U"}
             </div>
             <span className="text-[11px] font-bold text-zinc-500 truncate italic">{asset.sender_name || "Unknown"}</span>
           </div>
           
           <div className="flex items-center gap-1 text-zinc-400 ml-auto">
              <Calendar size={10} />
              <span className="text-[10px] font-bold">{new Date(asset.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
           </div>
        </div>

        {/* Status indicator bar */}
        <div className="mt-4 flex items-center justify-between">
           <div className="flex items-center gap-1">
              {asset.approval_status === "approved" ? (
                <CheckCircle2 size={12} className="text-emerald-500" />
              ) : (
                <Clock3 size={12} className="text-amber-500" />
              )}
              <span className={`text-[10px] font-black uppercase tracking-tighter ${asset.approval_status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {asset.approval_status || "Pending Review"}
              </span>
           </div>
           <ChevronRight size={14} className="text-zinc-300 group-hover:text-indigo-600 transition-colors translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}
