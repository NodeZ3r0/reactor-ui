import { useState } from "react";
import { chatCompletion, queryDocuments, listOllamaModels, type ChatMessage, type OllamaModel } from "../api";

export function LLMChatView() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("qwen2.5-coder:7b");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useRAG, setUseRAG] = useState(true);

  // Load models on mount
  useState(() => {
    listOllamaModels().then(data => {
      setModels(data.models);
      if (data.models.length > 0) setSelectedModel(data.models[0].name);
    }).catch(console.error);
  });

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Get RAG context if enabled
      let context: string[] = [];
      if (useRAG) {
        const ragResults = await queryDocuments(input, 3);
        context = ragResults.results?.map((r: any) => r.content) || [];
      }

      // Send chat completion
      const response = await chatCompletion({
        model: selectedModel,
        messages: [...messages, userMsg],
        context: context.length > 0 ? context : undefined,
        temperature: 0.7,
        max_tokens: 2048
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.message?.content || "No response"
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{padding: "20px", maxWidth: "800px", margin: "0 auto"}}>
      <h2>LLM Chat with RAG</h2>
      
      <div style={{marginBottom: "20px"}}>
        <label>
          Model: 
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{marginLeft: "10px"}}>
            {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </label>
        <label style={{marginLeft: "20px"}}>
          <input type="checkbox" checked={useRAG} onChange={e => setUseRAG(e.target.checked)} />
          Use RAG Context
        </label>
      </div>

      <div style={{border: "1px solid #333", borderRadius: "5px", padding: "15px", minHeight: "400px", marginBottom: "20px", backgroundColor: "#111"}}>
        {messages.map((msg, i) => (
          <div key={i} style={{marginBottom: "15px", padding: "10px", borderRadius: "5px", backgroundColor: msg.role === "user" ? "#1a3a1a" : "#1a1a3a"}}>
            <strong>{msg.role === "user" ? "You" : "AI"}:</strong>
            <div style={{marginTop: "5px", whiteSpace: "pre-wrap"}}>{msg.content}</div>
          </div>
        ))}
        {loading && <div style={{color: "#888"}}>Thinking...</div>}
      </div>

      <div style={{display: "flex", gap: "10px"}}>
        <input 
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Ask a question..."
          style={{flex: 1, padding: "10px", borderRadius: "5px", backgroundColor: "#222", color: "#fff", border: "1px solid #444"}}
        />
        <button onClick={sendMessage} disabled={loading} style={{padding: "10px 20px", borderRadius: "5px", backgroundColor: "#4a9eff", color: "#fff", border: "none", cursor: "pointer"}}>
          Send
        </button>
      </div>
    </div>
  );
}
