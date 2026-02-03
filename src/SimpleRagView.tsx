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
  upsertProject: (p: any) => void;
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

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
  useEffect(() => { loadDocuments(); }, []);

  async function loadDocuments() {
    setLoading(true);
    try {
      const rawDocs = await listAllDocuments();
      // Deduplicate and clean: hide __DELETED__, junk, and migrated flat docs
      const sourceSet = new Set<string>(rawDocs.map(d => d.source));
      const docs = rawDocs.filter(doc => {
        const src = doc.source || "";
        // Hide docs marked as deleted
        if (src.startsWith("__DELETED__/")) return false;
        // Hide bare flat docs if a project-prefixed version exists
        // e.g. hide "reactor-ai-spec.md" if "Reactor/reactor-ai-spec.md" exists
        if (!src.includes("/")) {
          for (const other of sourceSet) {
            if (other.includes("/") && other.endsWith("/" + src)) {
              return false;
            }
          }
        }
        // Hide subfolder docs if a deeper prefixed version exists
        // e.g. hide "Build Plans/X.md" if "Brainjoos/Build Plans/X.md" exists
        if (src.includes("/")) {
          for (const other of sourceSet) {
            if (other !== src && other.endsWith("/" + src)) {
              return false;
            }
          }
        }
        return true;
      });
      setDocuments(docs);
      setFilteredDocs(docs);
      setShowDocs(true);
    } catch (error: any) {
      alert("Failed to load documents: " + (error.message || String(error)));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(inputRef: React.RefObject<HTMLInputElement>) {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) {
      setUploadStatus("✗ Please select files or a folder");
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`Uploading ${i + 1}/${files.length}: ${file.name}`);

        try {
          const text = await file.text();
          const rawPath = (file as any).webkitRelativePath || file.name;
          // Prefix with project name so docs nest under the project
          const filepath = props.activeProject
            ? (rawPath.toLowerCase().startsWith(props.activeProject.name.toLowerCase() + "/")
                ? rawPath
                : props.activeProject.name + "/" + rawPath)
            : rawPath;
          const metadata = props.activeProject ? {
            project_id: props.activeProject.id,
            project_name: props.activeProject.name,
            filename: file.name,
            filepath: filepath
          } : {
            filename: file.name,
            filepath: filepath
          };

          await uploadDocument(text, filepath, metadata);
          successCount++;
        } catch (err: any) {
          console.error(`Failed to upload ${file.name}:`, err);
          failCount++;
        }
      }

      setUploadStatus(`✓ Uploaded ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ""}`);
      if (inputRef.current) inputRef.current.value = "";
      setFileSelected(false);
      setTimeout(() => setUploadStatus(""), 5000);
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

  // Merge Forgejo repos + RAG-derived projects, deduplicate, sort alphabetically
  // Show doc counts for all projects that have RAG documents
  const allProjects = (() => {
    const byName = new Map<string, {id: string; name: string; provider: string; description?: string}>();

    // First pass: count RAG docs per project
    const ragCounts = new Map<string, number>();
    for (const doc of documents) {
      const projectName = doc.metadata?.project_name
        || (doc.source?.includes("/") ? doc.source.split("/")[0] : null);
      if (projectName) {
        ragCounts.set(projectName, (ragCounts.get(projectName) || 0) + 1);
      }
    }

    // Add Forgejo repos, enriched with doc counts if available
    for (const p of props.projects) {
      const count = ragCounts.get(p.name) || 0;
      byName.set(p.name.toLowerCase(), {
        ...p,
        description: count > 0 ? `${count} docs in RAG` : "forgejo",
      });
    }

    // Add RAG-only projects (not in Forgejo)
    for (const [projectName, count] of ragCounts.entries()) {
      if (!byName.has(projectName.toLowerCase())) {
        byName.set(projectName.toLowerCase(), {
          id: projectName,
          name: projectName,
          provider: "rag",
          description: `${count} docs in RAG`,
        });
      }
    }

    return Array.from(byName.values()).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  })();

  const filteredProjects = projectSearch.trim()
    ? allProjects.filter(p =>
        p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        p.provider.toLowerCase().includes(projectSearch.toLowerCase()) ||
        (p as any).description?.toLowerCase().includes(projectSearch.toLowerCase())
      )
    : allProjects;

  function openNewProjectModal() {
    setNewProjectName("");
    setNewProjectOpen(true);
  }

  function createNewProject() {
    const name = newProjectName.trim();
    if (!name) return;

    // Create a simple Forgejo project
    const project = {
      id: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name: name,
      provider: 'forgejo',
      repo: name,
      repoUrl: `https://vault.wopr.systems/${name}`,
      createdAt: new Date().toISOString()
    };

    props.upsertProject(project);
    props.setActiveProjectId(project.id);
    setNewProjectOpen(false);
  }

  return (
    <div className="main-panels">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Upload Documents to RAG</div>
        </div>
        <div className="panel-body">
          <div style={{marginBottom: "20px", paddingBottom: "15px", borderBottom: "1px solid #333"}}>
            {/* Breadcrumb bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              fontSize: "12px",
              color: "#888"
            }}>
              <span>RAG</span>
              <span style={{color: "#555"}}>{">"}</span>
              {props.activeProject ? (
                <span style={{color: "#4aff4a", fontWeight: "bold"}}>{props.activeProject.name}</span>
              ) : (
                <span style={{color: "#ff9e4a"}}>No project selected</span>
              )}
              <span style={{color: "#555"}}>{">"}</span>
              <span>Upload</span>
            </div>

            {/* Project selector */}
            <div style={{display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px"}}>
              <button
                onClick={() => setProjectPickerOpen(true)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  backgroundColor: props.activeProject ? "#0a1a0a" : "#020b0d",
                  color: props.activeProject ? "#4aff4a" : "#888",
                  border: props.activeProject ? "1px solid #4aff4a44" : "1px solid #444",
                  borderRadius: "4px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span>
                  {props.activeProject
                    ? props.activeProject.name
                    : "Select project..."}
                </span>
                <span style={{fontSize: "11px", color: "#888"}}>Change</span>
              </button>
              <button onClick={openNewProjectModal} className="btn btn-ghost">+ New</button>
            </div>

            {/* Status indicator */}
            {props.activeProject ? (
              <div style={{
                padding: "8px 12px",
                backgroundColor: "#0a1a0a",
                border: "1px solid #4aff4a33",
                borderRadius: "4px",
                color: "#4aff4a",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span style={{fontSize: "8px"}}>●</span>
                Ready to upload to <strong>{props.activeProject.name}</strong>
              </div>
            ) : (
              <div style={{
                padding: "8px 12px",
                backgroundColor: "#1a1200",
                border: "1px solid #ff9e4a33",
                borderRadius: "4px",
                color: "#ff9e4a",
                fontSize: "12px"
              }}>
                Select a project above before uploading documents
              </div>
            )}
          </div>
          <div style={{marginBottom: "15px"}}>
            <p style={{color: "#888", marginBottom: "10px"}}>
              Upload files or folders to the RAG vector database for AI-enhanced responses.
            </p>
            <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
              <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
                <input
                  type="file"
                  ref={fileRef}
                  onChange={() => setFileSelected(!!fileRef.current?.files?.[0])}
                  multiple
                  disabled={uploading}
                  style={{flex: 1}}
                />
                <button
                  onClick={() => handleUpload(fileRef)}
                  disabled={uploading || !props.activeProject}
                  className="btn btn-primary"
                >
                  {uploading ? "Uploading..." : "Upload Files"}
                </button>
              </div>
              <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
                <div style={{flex: 1, position: "relative"}}>
                  <input
                    type="file"
                    ref={folderRef}
                    onChange={() => setFileSelected(!!folderRef.current?.files?.[0])}
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    disabled={uploading}
                    style={{
                      position: "absolute",
                      opacity: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer"
                    }}
                  />
                  <div
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #444",
                      borderRadius: "4px",
                      backgroundColor: "#1a1a1a",
                      color: folderRef.current?.files?.[0] ? "#c7ffe4" : "#888",
                      cursor: "pointer",
                      pointerEvents: "none"
                    }}
                  >
                    {folderRef.current?.files?.[0]
                      ? `${folderRef.current.files.length} file(s) selected`
                      : "Choose folder..."}
                  </div>
                </div>
                <button
                  onClick={() => handleUpload(folderRef)}
                  disabled={uploading || !props.activeProject}
                  className="btn btn-primary"
                >
                  {uploading ? "Uploading..." : "Upload Folder"}
                </button>
              </div>
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
                <div style={{display: "flex", flexDirection: "column", gap: "4px"}}>
                  {(() => {
                    // Group docs by project
                    const groups: Record<string, {doc: RagDocument; idx: number}[]> = {};
                    filteredDocs.forEach((doc, idx) => {
                      const project = doc.metadata?.project_name
                        || (doc.source?.includes("/") ? doc.source.split("/")[0] : null)
                        || "Ungrouped";
                      if (!groups[project]) groups[project] = [];
                      groups[project].push({doc, idx});
                    });
                    // Sort: named projects first, Ungrouped last
                    const sortedKeys = Object.keys(groups).sort((a, b) => {
                      if (a === "Ungrouped") return 1;
                      if (b === "Ungrouped") return -1;
                      return a.localeCompare(b);
                    });
                    return sortedKeys.map(projectName => {
                      const items = groups[projectName];
                      const isCollapsed = collapsedGroups.has(projectName);
                      const selectedCount = items.filter(i => selectedDocs.has(i.idx)).length;
                      return (
                        <div key={projectName} style={{marginBottom: "4px"}}>
                          <div
                            onClick={() => {
                              const next = new Set(collapsedGroups);
                              if (next.has(projectName)) next.delete(projectName);
                              else next.add(projectName);
                              setCollapsedGroups(next);
                            }}
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "#111",
                              borderRadius: "3px",
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              borderLeft: "3px solid #ff9e4a",
                              userSelect: "none"
                            }}
                          >
                            <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                              <span style={{color: "#888", fontSize: "11px"}}>{isCollapsed ? "+" : "-"}</span>
                              <span style={{color: "#ff9e4a", fontSize: "13px", fontWeight: "bold"}}>{projectName}</span>
                              <span style={{color: "#666", fontSize: "11px"}}>({items.length} doc{items.length !== 1 ? "s" : ""})</span>
                            </div>
                            {selectedCount > 0 && (
                              <span style={{color: "#4aff4a", fontSize: "11px"}}>{selectedCount} selected</span>
                            )}
                          </div>
                          {!isCollapsed && (
                            <div style={{display: "flex", flexDirection: "column", gap: "4px", marginLeft: "12px", marginTop: "4px"}}>
                              {items.map(({doc, idx}) => (
                                <div
                                  key={idx}
                                  onClick={() => toggleDocSelection(idx)}
                                  style={{
                                    padding: "8px 10px",
                                    backgroundColor: selectedDocs.has(idx) ? "#1a3a1a" : "#0a0a0a",
                                    borderRadius: "3px",
                                    borderLeft: selectedDocs.has(idx) ? "3px solid #4aff4a" : "3px solid #4a9eff",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                  }}
                                >
                                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "2px"}}>
                                    <div style={{color: "#4a9eff", fontSize: "12px", fontWeight: "bold"}}>
                                      {doc.metadata?.filename || doc.source?.split("/").pop() || doc.source || "unknown"}
                                    </div>
                                    {selectedDocs.has(idx) && (
                                      <div style={{color: "#4aff4a", fontSize: "11px"}}>In Chat</div>
                                    )}
                                  </div>
                                  <div style={{
                                    color: "#ccc",
                                    fontSize: "11px",
                                    whiteSpace: "pre-wrap",
                                    maxHeight: "40px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                  }}>
                                    {doc.content?.substring(0, 150)}{doc.content?.length > 150 ? "..." : ""}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <LLMChatPanel activeProject={props.activeProject} selectedDocuments={selectedDocsList} />

      {projectPickerOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setProjectPickerOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#0a0a0a",
              border: "1px solid #333",
              borderRadius: "8px",
              padding: "24px",
              width: "90vw",
              maxWidth: "800px", boxSizing: "border-box" as const,
              maxHeight: "80vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{marginBottom: "16px", color: "#4a9eff"}}>Select Project</h3>
            <input
              type="text"
              placeholder="Search projects..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              className="input"
              style={{marginBottom: "16px"}}
              autoFocus
            />
            <div style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0px",
              marginBottom: "16px"
            }}>
              {filteredProjects.length === 0 ? (
                <div style={{color: "#666", padding: "20px", textAlign: "center"}}>
                  {projectSearch ? "No projects match your search" : "No projects yet. Create one!"}
                </div>
              ) : (
                (() => {
                  // Group related projects for cleaner organization
                  const groupPatterns: [string, RegExp][] = [
                    ["Reactor", /^reactor/i],
                    ["WOPR", /^wopr/i],
                    ["DEFCON", /^defcon/i],
                  ];

                  type ProjType = typeof filteredProjects[0];
                  const groups: Record<string, ProjType[]> = {};
                  const standalone: ProjType[] = [];
                  const used = new Set<string>();

                  for (const [gName, pattern] of groupPatterns) {
                    const matches = filteredProjects.filter(p =>
                      pattern.test(p.name) || pattern.test(p.id || "")
                    );
                    if (matches.length > 1) {
                      groups[gName] = matches;
                      matches.forEach(m => used.add(m.name));
                    }
                  }
                  filteredProjects.forEach(p => {
                    if (!used.has(p.name)) standalone.push(p);
                  });

                  const renderItem = (project: ProjType, indent = false) => (
                    <div
                      key={project.id}
                      onClick={() => {
                        props.upsertProject({ id: project.id, name: project.name, provider: project.provider || "rag" });
                        props.setActiveProjectId(project.id);
                        setProjectPickerOpen(false);
                        setProjectSearch("");
                      }}
                      style={{
                        padding: indent ? "6px 12px 6px 28px" : "6px 12px",
                        backgroundColor: props.activeProject?.id === project.id ? "#1a3a1a" : "transparent",
                        borderLeft: props.activeProject?.id === project.id ? "3px solid #4aff4a" : "3px solid transparent",
                        borderBottom: "1px solid #111",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px"
                      }}
                      onMouseEnter={(e) => {
                        if (props.activeProject?.id !== project.id) {
                          e.currentTarget.style.backgroundColor = "#0d1520";
                          e.currentTarget.style.borderLeftColor = "#4a9eff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (props.activeProject?.id !== project.id) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.borderLeftColor = "transparent";
                        }
                      }}
                    >
                      <span style={{fontWeight: 500, color: "#c7ffe4", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                        {project.name}
                      </span>
                      <div style={{display: "flex", alignItems: "center", gap: "6px", flexShrink: 0}}>
                        {(project as any).description && (
                          <span style={{fontSize: "11px", color: "#555", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                            {(project as any).description}
                          </span>
                        )}
                        <span style={{
                          fontSize: "9px",
                          color: (project as any).description?.includes("docs in RAG") ? "#ff9e4a" : "#444",
                          padding: "1px 5px",
                          backgroundColor: (project as any).description?.includes("docs in RAG") ? "rgba(255,158,74,0.1)" : "#0a0a0a",
                          borderRadius: "3px",
                          border: (project as any).description?.includes("docs in RAG") ? "1px solid rgba(255,158,74,0.2)" : "1px solid #1a1a1a",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em"
                        }}>
                          {(project as any).description?.includes("docs in RAG") ? "RAG" : project.provider}
                        </span>
                      </div>
                    </div>
                  );

                  const groupKeys = Object.keys(groups).sort();

                  return (
                    <>
                      {groupKeys.map(gName => (
                        <div key={gName} style={{marginBottom: "4px"}}>
                          <div style={{
                            padding: "6px 10px 4px",
                            fontSize: "10px",
                            textTransform: "uppercase",
                            letterSpacing: "0.16em",
                            color: "#4a9eff",
                            fontWeight: 600,
                            borderBottom: "1px solid #0d2040"
                          }}>
                            {gName} <span style={{color: "#333", fontWeight: 400}}>({groups[gName].length})</span>
                          </div>
                          {groups[gName].map(p => renderItem(p, true))}
                        </div>
                      ))}
                      {standalone.length > 0 && groupKeys.length > 0 && (
                        <div style={{
                          padding: "6px 10px 4px",
                          fontSize: "10px",
                          textTransform: "uppercase",
                          letterSpacing: "0.16em",
                          color: "#6fa58f",
                          fontWeight: 600,
                          borderBottom: "1px solid #1a2a22",
                          marginTop: "4px"
                        }}>
                          Other <span style={{color: "#333", fontWeight: 400}}>({standalone.length})</span>
                        </div>
                      )}
                      {standalone.map(p => renderItem(p, false))}
                    </>
                  );
                })()
              )}
            </div>
            <button
              onClick={() => {
                setProjectPickerOpen(false);
                setProjectSearch("");
              }}
              className="btn btn-ghost"
              style={{alignSelf: "flex-end"}}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {newProjectOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setNewProjectOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#0a0a0a",
              border: "1px solid #333",
              borderRadius: "8px",
              padding: "24px",
              minWidth: "400px",
              maxWidth: "500px"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{marginBottom: "20px", color: "#4a9eff"}}>Create New Forgejo Project</h3>
            <div style={{marginBottom: "20px"}}>
              <label style={{display: "block", marginBottom: "8px", color: "#888"}}>
                Project Name
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="my-project"
                className="input"
                style={{width: "100%"}}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createNewProject();
                  if (e.key === 'Escape') setNewProjectOpen(false);
                }}
                autoFocus
              />
              <div style={{fontSize: "12px", color: "#666", marginTop: "4px"}}>
                Will be created in Forgejo at: vault.wopr.systems/{newProjectName || 'project-name'}
              </div>
            </div>
            <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
              <button
                onClick={() => setNewProjectOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={createNewProject}
                disabled={!newProjectName.trim()}
                className="btn btn-primary"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
