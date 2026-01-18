import { useState, useRef } from "react";
import { uploadDocument, listDocuments } from "../api";

export function DocumentUploadView() {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      await uploadDocument(text, file.name);
      alert("Document uploaded successfully!");
      if (fileRef.current) fileRef.current.value = "";
      // Refresh documents list
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (error: any) {
      alert("Upload failed: " + error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{padding: "20px"}}>
      <h2>Upload Documents to RAG</h2>
      <div style={{marginTop: "20px"}}>
        <input type="file" ref={fileRef} accept=".txt,.md,.py,.js,.ts,.tsx,.json" />
        <button 
          onClick={handleUpload} 
          disabled={uploading}
          style={{marginLeft: "10px", padding: "10px 20px", backgroundColor: "#4a9eff", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer"}}
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
      <div style={{marginTop: "30px"}}>
        <h3>Uploaded Documents</h3>
        {documents.length === 0 && <p style={{color: "#888"}}>No documents yet</p>}
        {documents.map((doc, i) => (
          <div key={i} style={{padding: "10px", margin: "5px 0", backgroundColor: "#222", borderRadius: "5px"}}>
            {doc.filename || doc.source}
          </div>
        ))}
      </div>
    </div>
  );
}
