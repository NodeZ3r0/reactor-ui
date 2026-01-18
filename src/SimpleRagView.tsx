import { useState, useRef } from "react";
import { uploadDocument } from "./api";
import { LLMChatPanel } from "./LLMChatPanel";

export function SimpleRagView() {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus("Reading file...");
    try {
      const text = await file.text();
      setUploadStatus("Uploading to RAG...");
      await uploadDocument(text, file.name);
      setUploadStatus("✓ Document uploaded successfully!");
      if (fileRef.current) fileRef.current.value = "";
      setTimeout(() => setUploadStatus(""), 3000);
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
            <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
              <input 
                type="file" 
                ref={fileRef} 
                accept=".txt,.md,.py,.js,.ts,.tsx,.json,.java,.go,.rs" 
                disabled={uploading}
                style={{flex: 1}}
              />
              <button 
                onClick={handleUpload} 
                disabled={uploading || !fileRef.current?.files?.[0]}
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
        </div>
      </div>

      <LLMChatPanel />
    </div>
  );
}
