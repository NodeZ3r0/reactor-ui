import { useState, useRef, useEffect } from "react";
import { uploadDocument, listAllDocuments } from "./api";
import { LLMChatPanel } from "./LLMChatPanel";

export function SimpleRagView() {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [fileSelected, setFileSelected] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await listAllDocuments();
      setDocuments(docs);
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
      await uploadDocument(text, file.name);
      setUploadStatus("✓ Document uploaded successfully!");
      if (fileRef.current) fileRef.current.value = "";
      setFileSelected(false);
      setTimeout(() => setUploadStatus(""), 3000);
      // Reload document list if showing
      if (showDocs) {
        loadDocuments();
      }
    } catch (error: any) {
      setUploadStatus("✗ Upload failed: " + (error.message || String(error)));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="main-panels">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Upload Documents to RAG</div>
        </div>
        <div className="panel-body">
          <div style={{marginBottom: "15px"}}>
            <p style={{color: "#888", marginBottom: "10px"}}>
              Upload documents to the RAG vector database for AI-enhanced responses.
            </p>
            <div style={{display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px"}}>
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
                disabled={uploading}
                className="btn btn-primary"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            <button 
              onClick={loadDocuments}
              disabled={loading}
              className="btn"
              style={{width: "100%", marginBottom: "10px"}}
            >
              {loading ? "Loading..." : `${showDocs ? "Refresh" : "View"} Document List`}
            </button>
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
            {showDocs && (
              <div style={{
                marginTop: "15px",
                padding: "10px",
                border: "1px solid #333",
                borderRadius: "5px",
                maxHeight: "300px",
                overflowY: "auto"
              }}>
                <div style={{marginBottom: "10px", fontWeight: "bold", color: "#4a9eff"}}>
                  Documents in RAG ({documents.length})
                </div>
                {documents.length === 0 ? (
                  <div style={{color: "#666", fontStyle: "italic"}}>No documents found</div>
                ) : (
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    {documents.map((doc, idx) => (
                      <div 
                        key={idx}
                        style={{
                          padding: "8px",
                          backgroundColor: "#0a0a0a",
                          borderRadius: "3px",
                          borderLeft: "3px solid #4a9eff"
                        }}
                      >
                        <div style={{color: "#4a9eff", fontSize: "12px", marginBottom: "4px"}}>
                          Source: {doc.source || "unknown"}
                        </div>
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
      </div>

      <LLMChatPanel />
    </div>
  );
}
