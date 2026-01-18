import { useState, useEffect } from "react";
import { chatCompletion, queryDocuments, listOllamaModels, type ChatMessage } from "./api";

export function LLMChatPanel(props: { 
  activeProject: { id: string; name: string } | null;
  selectedDocuments?: Array<{ content: string; source: string; metadata?: any }>;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("qwen2.5-coder:7b");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useRAG, setUseRAG] = useState(true);

  useEffect(() => {
    listOllamaModels().then(data => {
      const modelNames = data.models.map((m: any) => m.name);
      setModels(modelNames);
      if (modelNames.length > 0) setSelectedModel(modelNames[0]);
    }).catch(err => console.error("Failed to load models:", err));
  }, []);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      let context: string[] = [];
      if (useRAG) {
        // Use selected documents if available, otherwise query RAG
        if (props.selectedDocuments && props.selectedDocuments.length > 0) {
          context = props.selectedDocuments.map(d => d.content);
        } else {
          try {
            const metadata = props.activeProject ? { project_id: props.activeProject.id } : undefined;
            const ragResults = await queryDocuments(input, 3, metadata);
            context = ragResults.results?.map((r: any) => r.content) || [];
          } catch (e) {
            console.warn("RAG query failed:", e);
          }
        }
      }

      const response = await chatCompletion({
        model: selectedModel,
        messages: newMessages,
        context: context.length > 0 ? context : undefined,
        temperature: 0.7,
        max_tokens: 2048
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.message?.content || "No response"
      };
      setMessages([...newMessages, assistantMsg]);
    } catch (error: any) {
      alert("Chat error: " + (error.message || String(error)));
      setMessages(newMessages); // Keep user message
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">LLM Chat</div>
        <div style={{display: "flex", gap: "10px", alignItems: "center", fontSize: "14px"}}>
          <label>
            <input type="checkbox" checked={useRAG} onChange={e => setUseRAG(e.target.checked)} />
            {" "}Use RAG
          </label>
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="select" style={{backgroundColor: "#020b0d", color: "#c7ffe4"}}>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="panel-body" style={{display: "flex", flexDirection: "column", height: "500px"}}>
        <div style={{flex: 1, overflowY: "auto", marginBottom: "15px", padding: "10px", border: "1px solid #333", borderRadius: "5px"}}>
          {messages.length === 0 && (
            <div style={{color: "#666", textAlign: "center", marginTop: "50px"}}>
              Start a conversation with your AI assistant
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: "12px",
              padding: "10px",
              borderRadius: "5px",
              backgroundColor: msg.role === "user" ? "#1a3a1a" : "#1a1a3a",
              borderLeft: `3px solid ${msg.role === "user" ? "#4a9eff" : "#ff9e4a"}`
            }}>
              <strong style={{color: msg.role === "user" ? "#4a9eff" : "#ff9e4a"}}>
                {msg.role === "user" ? "You" : "AI"}:
              </strong>
              <div style={{marginTop: "5px", whiteSpace: "pre-wrap", lineHeight: "1.5"}}>{msg.content}</div>
            </div>
          ))}
          {loading && <div style={{color: "#888", fontStyle: "italic"}}>AI is thinking...</div>}
        </div>
        <div style={{display: "flex", gap: "10px"}}>
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a question (press Enter to send)..."
            disabled={loading}
            className="input"
            style={{flex: 1}}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()} className="btn btn-primary">
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
