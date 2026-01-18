import { useState, useRef, useEffect } from "react";
import { uploadDocument, listAllDocuments } from "./api";
import { LLMChatPanel } from "./LLMChatPanel";

interface RagDocument {
  content: string;
  source: string;
  metadata?: {
    project_id?: string;
    project_name?: string;
    filename?: string;
  };
}

export function SimpleRagView(props: {
  activeProject: { id: string; name: string } | null;
  projects: Array<{ id: string; name: string; provider: string }>;
  setActiveProjectId: (id: string) => void;
  onNewProject: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [fileSelected, setFileSelected] = useState(false);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<RagDocument[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Filter documents based on search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = documents.filter(doc =>
        doc.source.toLowerCase().includes(query) ||
        doc.content.toLowerCase().includes(query) ||
        doc.metadata?.project_name?.toLowerCase().includes(query) ||
        doc.metadata?.filename?.toLowerCase().includes(query)
      );
      setFilteredDocs(filtered);
    } else {
      setFilteredDocs(documents);
    }
  }, [searchQuery, documents]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await listAllDocuments();
      setDocuments(docs);
      setFilteredDocs(docs);
      setShowDocs(true);
    } catch (error: any) {
      alert("Failed to load documents: " + (error.message || String(error)));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadStatus("✗ Please select a file first");
      return;
    }

    setUploading(true);
    setUploadStatus("Reading file...");
    try {
      const text = await file.text();
      setUploadStatus("Uploading to RAG...");
      const metadata = props.activeProject ? {
        project_id: props.activeProject.id,
        project_name: props.activeProject.name,
        filename: file.name
      } : { filename: file.name };
      await uploadDocument(text, file.name, metadata);
      setUploadStatus("✓ Document uploaded successfully!");
      if (fileRef.current) fileRef.current.value = "";
      setFileSelected(false);
      setTimeout(() => setUploadStatus(""), 3000);
      if (showDocs) {
        loadDocuments();
      }
    } catch (error: any) {
      setUploadStatus("✗ Upload failed: " + (error.message || String(error)));
    } finally {
      setUploading(false);
    }
  }

  function toggleDocSelection(index: number) {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedDocs(newSelected);
  }

  const selectedDocsList = Array.from(selectedDocs).map(idx => filteredDocs[idx]).filter(Boolean);

  return (
    <div className="main-panels">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Upload Documents to RAG</div>
        </div>
        <div className="panel-body">
          <div style={{marginBottom: "20px", paddingBottom: "15px", borderBottom: "1px solid #333"}}>
            <div style={{display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px"}}>
              <label style={{color: "#888", minWidth: "100px"}}>Active Project:</label>
              <select
                value={props.activeProject?.id || ""}
                onChange={e => props.setActiveProjectId(e.target.value)}
                className="select"
                style={{flex: 1, backgroundColor: "#020b0d", color: "#c7ffe4"}}
              >
                <option value="" disabled>Select project...</option>
                {props.projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {p.provider}</option>
                ))}
              </select>
              <button onClick={props.onNewProject} className="btn btn-ghost">+ New Project</button>
            </div>
            {!props.activeProject && (
              <div style={{color: "#ff9e4a", fontSize: "13px", marginTop: "8px"}}>
                ⚠ Select a project to upload documents
              </div>
            )}
          </div>
          <div style={{marginBottom: "15px"}}>
            <p style={{color: "#888", marginBottom: "10px"}}>
              Upload documents to the RAG vector database for AI-enhanced responses.
            </p>
            <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
              <input
                type="file"
                ref={fileRef}
                onChange={() => setFileSelected(!!fileRef.current?.files?.[0])}
                accept=".txt,.md,.py,.js,.ts,.tsx,.json,.java,.go,.rs"
                disabled={uploading}
                style={{flex: 1}}
              />
              <button
                onClick={handleUpload}
                disabled={uploading || !props.activeProject}
                className="btn btn-primary"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            {uploadStatus && (
              <div style={{
                marginTop: "10px",
                padding: "10px",
                borderRadius: "5px",
                backgroundColor: uploadStatus.startsWith("✓") ? "#1a3a1a" : uploadStatus.startsWith("✗") ? "#3a1a1a" : "#1a1a3a",
                color: uploadStatus.startsWith("✓") ? "#4aff4a" : uploadStatus.startsWith("✗") ? "#ff4a4a" : "#fff"
              }}>
                {uploadStatus}
              </div>
            )}
          </div>
          <button
            onClick={loadDocuments}
            disabled={loading}
            className="btn"
            style={{width: "100%", marginBottom: "10px"}}
          >
            {loading ? "Loading..." : `${showDocs ? "Refresh" : "View"} Document List`}
          </button>
          {showDocs && (
            <div style={{
              marginTop: "15px",
              padding: "10px",
              border: "1px solid #333",
              borderRadius: "5px",
              maxHeight: "400px",
              overflowY: "auto"
            }}>
              <div style={{marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <div style={{fontWeight: "bold", color: "#4a9eff"}}>
                  Documents in RAG ({filteredDocs.length})
                </div>
                {selectedDocs.size > 0 && (
                  <div style={{color: "#4aff4a", fontSize: "13px"}}>
                    {selectedDocs.size} selected for chat
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Search documents by name, content, or project..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input"
                style={{width: "100%", marginBottom: "10px"}}
              />
              {filteredDocs.length === 0 ? (
                <div style={{color: "#666", fontStyle: "italic"}}>
                  {searchQuery ? "No documents match your search" : "No documents found"}
                </div>
              ) : (
                <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                  {filteredDocs.map((doc, idx) => (
                    <div
                      key={idx}
                      onClick={() => toggleDocSelection(idx)}
                      style={{
                        padding: "10px",
                        backgroundColor: selectedDocs.has(idx) ? "#1a3a1a" : "#0a0a0a",
                        borderRadius: "3px",
                        borderLeft: selectedDocs.has(idx) ? "3px solid #4aff4a" : "3px solid #4a9eff",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px"}}>
                        <div style={{color: "#4a9eff", fontSize: "12px", fontWeight: "bold"}}>
                          {doc.metadata?.filename || doc.source || "unknown"}
                        </div>
                        {selectedDocs.has(idx) && (
                          <div style={{color: "#4aff4a", fontSize: "11px"}}>✓ In Chat</div>
                        )}
                      </div>
                      {doc.metadata?.project_name && (
                        <div style={{color: "#ff9e4a", fontSize: "11px", marginBottom: "4px"}}>
                          Project: {doc.metadata.project_name}
                        </div>
                      )}
                      <div style={{
                        color: "#ccc",
                        fontSize: "11px",
                        whiteSpace: "pre-wrap",
                        maxHeight: "60px",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>
                        {doc.content?.substring(0, 200)}{doc.content?.length > 200 ? "..." : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <LLMChatPanel activeProject={props.activeProject} selectedDocuments={selectedDocsList} />
    </div>
  );
}
