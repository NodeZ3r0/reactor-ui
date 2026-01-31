import { useState, useEffect, useRef } from "react";
import {
  chatCompletion, chatWithTools, chatContinue,
  queryDocuments, listOllamaModels, uploadDocument,
  type ChatMessage, type ToolLogEntry, type ToolChatResponse
} from "./api";

type DisplayMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolLog?: ToolLogEntry[];
  pendingApproval?: {
    tool: string;
    args: Record<string, any>;
    proposalId: string;
    defconUrl: string;
  };
};

export function LLMChatPanel(props: {
  activeProject: { id: string; name: string } | null;
  selectedDocuments?: Array<{ content: string; source: string; metadata?: any }>;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("qwen2.5-coder:7b");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useRAG, setUseRAG] = useState(true);
  const [useTools, setUseTools] = useState(false);
  const [saveConversations, setSaveConversations] = useState(true);
  const [pendingApproval, setPendingApproval] = useState<{
    tool: string;
    args: Record<string, any>;
    proposalId: string;
    conversation: ChatMessage[];
  } | null>(null);
  const [pollingProposal, setPollingProposal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listOllamaModels().then(data => {
      const modelNames = data.models.map((m: any) => m.name);
      setModels(modelNames);
      if (modelNames.length > 0) setSelectedModel(modelNames[0]);
    }).catch(err => console.error("Failed to load models:", err));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function saveConversationToRAG(userMessage: string, aiResponse: string) {
    if (!saveConversations) return;
    try {
      const timestamp = new Date().toISOString();
      const conversationText = `[Conversation on ${new Date(timestamp).toLocaleString()}]\n\nUser: ${userMessage}\n\nAI: ${aiResponse}`;
      const metadata: any = { type: "conversation", timestamp, model: selectedModel };
      if (props.activeProject) {
        metadata.project_id = props.activeProject.id;
        metadata.project_name = props.activeProject.name;
      }
      await uploadDocument(conversationText, `conversation-${timestamp}`, metadata);
    } catch (error) {
      console.warn("Failed to save conversation to RAG:", error);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg: DisplayMessage = { role: "user", content: input };
    const userMessageText = input;
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const newChatHistory: ChatMessage[] = [...chatHistory, { role: "user", content: userMessageText }];
    setChatHistory(newChatHistory);

    try {
      let context: string[] = [];
      if (useRAG) {
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

      if (useTools) {
        const response: ToolChatResponse = await chatWithTools({
          model: selectedModel,
          messages: newChatHistory,
          context: context.length > 0 ? context : undefined,
          temperature: 0.7,
          max_tokens: 4096,
          enable_tools: true,
        });
        handleToolResponse(response, newMessages, newChatHistory, userMessageText);
      } else {
        const response = await chatCompletion({
          model: selectedModel,
          messages: newChatHistory,
          context: context.length > 0 ? context : undefined,
          temperature: 0.7,
          max_tokens: 2048,
        });
        const assistantContent = response.message?.content || "No response";
        const assistantMsg: DisplayMessage = { role: "assistant", content: assistantContent };
        setMessages([...newMessages, assistantMsg]);
        setChatHistory([...newChatHistory, { role: "assistant", content: assistantContent }]);
        saveConversationToRAG(userMessageText, assistantContent);
      }
    } catch (error: any) {
      alert("Chat error: " + (error.message || String(error)));
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }

  function handleToolResponse(
    response: ToolChatResponse,
    displayMessages: DisplayMessage[],
    history: ChatMessage[],
    userMessageText: string
  ) {
    if (response.tool_log && response.tool_log.length > 0) {
      for (const entry of response.tool_log) {
        const toolMsg: DisplayMessage = {
          role: "tool",
          content: `Tool: ${entry.tool} | Status: ${entry.status}${entry.output_preview ? "\n" + entry.output_preview : ""}${entry.proposal_id ? "\nProposal: " + entry.proposal_id : ""}`,
          toolLog: [entry],
        };
        displayMessages = [...displayMessages, toolMsg];
      }
    }

    if (response.status === "pending_approval" && response.pending_tool) {
      const approvalMsg: DisplayMessage = {
        role: "assistant",
        content: response.message?.content || `Waiting for DEFCON approval to run ${response.pending_tool.tool}...`,
        pendingApproval: {
          tool: response.pending_tool.tool,
          args: response.pending_tool.args,
          proposalId: response.pending_tool.proposal_id,
          defconUrl: response.pending_tool.defcon_url,
        },
      };
      displayMessages = [...displayMessages, approvalMsg];
      setMessages(displayMessages);

      setPendingApproval({
        tool: response.pending_tool.tool,
        args: response.pending_tool.args,
        proposalId: response.pending_tool.proposal_id,
        conversation: response.conversation || history,
      });

      startPollingProposal(response.pending_tool.proposal_id, displayMessages, history, userMessageText);
    } else {
      const assistantContent = response.message?.content || "No response";
      const assistantMsg: DisplayMessage = { role: "assistant", content: assistantContent };
      displayMessages = [...displayMessages, assistantMsg];
      setMessages(displayMessages);
      setChatHistory([...history, { role: "assistant", content: assistantContent }]);
      saveConversationToRAG(userMessageText, assistantContent);
    }
  }

  function startPollingProposal(
    proposalId: string,
    displayMessages: DisplayMessage[],
    history: ChatMessage[],
    userMessageText: string
  ) {
    setPollingProposal(true);
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/defcon/proposals/${proposalId}`);
        if (!resp.ok) return;
        const proposal = await resp.json();

        if (proposal.status === "approved") {
          clearInterval(interval);
          setPollingProposal(false);

          const approvedMsg: DisplayMessage = {
            role: "tool",
            content: "DEFCON Approved - executing tool...",
          };
          const updatedMessages = [...displayMessages, approvedMsg];
          setMessages(updatedMessages);
          setLoading(true);

          try {
            const continueResp = await chatContinue({
              model: selectedModel,
              messages: pendingApproval?.conversation || history,
              tool_name: pendingApproval?.tool || "",
              tool_args: pendingApproval?.args || {},
              defcon_token: proposal.token,
              temperature: 0.7,
              max_tokens: 4096,
            });
            setPendingApproval(null);
            handleToolResponse(continueResp, updatedMessages, history, userMessageText);
          } catch (e: any) {
            const errMsg: DisplayMessage = { role: "assistant", content: "Error continuing: " + e.message };
            setMessages([...updatedMessages, errMsg]);
          } finally {
            setLoading(false);
          }
        } else if (proposal.status === "rejected") {
          clearInterval(interval);
          setPollingProposal(false);
          setPendingApproval(null);
          const rejMsg: DisplayMessage = { role: "tool", content: "DEFCON proposal was rejected." };
          setMessages([...displayMessages, rejMsg]);
        }
      } catch (e) {
        console.warn("Polling error:", e);
      }
    }, 3000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setPollingProposal(false);
    }, 300000);
  }

  function renderToolLog(entry: ToolLogEntry) {
    const statusColor = entry.status === "success" ? "#4ade80" : entry.status === "pending_approval" ? "#facc15" : "#f87171";
    return (
      <div style={{ fontSize: "12px", padding: "4px 8px", background: "#0a0a0a", borderRadius: "4px", borderLeft: `3px solid ${statusColor}`, marginBottom: "4px" }}>
        <span style={{ color: statusColor, fontWeight: "bold" }}>{entry.tool}</span>
        {entry.args && <span style={{ color: "#888" }}> ({Object.entries(entry.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})</span>}
        <span style={{ color: statusColor }}> [{entry.status}]</span>
        {entry.output_preview && <div style={{ color: "#aaa", marginTop: "2px", whiteSpace: "pre-wrap", maxHeight: "80px", overflow: "auto" }}>{entry.output_preview}</div>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">LLM Chat</div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "14px", flexWrap: "wrap" }}>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={useRAG} onChange={e => setUseRAG(e.target.checked)} />
            {" "}RAG
          </label>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={useTools} onChange={e => setUseTools(e.target.checked)} />
            {" "}Tools
          </label>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={saveConversations} onChange={e => setSaveConversations(e.target.checked)} />
            {" "}Save
          </label>
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="select" style={{ backgroundColor: "#020b0d", color: "#c7ffe4" }}>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", height: "500px" }}>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: "15px", padding: "10px", border: "1px solid #333", borderRadius: "5px" }}>
          {messages.length === 0 && (
            <div style={{ color: "#666", textAlign: "center", marginTop: "50px" }}>
              Start a conversation with your AI assistant
              {useTools && <div style={{ fontSize: "12px", marginTop: "8px", color: "#facc15" }}>Tools enabled &mdash; AI can execute commands via DEFCON One</div>}
            </div>
          )}
          {messages.map((msg, i) => {
            if (msg.role === "tool") {
              return (
                <div key={i} style={{ marginBottom: "8px", padding: "6px 10px", borderRadius: "5px", backgroundColor: "#0d1117", borderLeft: "3px solid #8b5cf6" }}>
                  {msg.toolLog ? msg.toolLog.map((e, j) => <div key={j}>{renderToolLog(e)}</div>) : (
                    <div style={{ fontSize: "13px", color: "#c084fc", fontFamily: "monospace" }}>{msg.content}</div>
                  )}
                </div>
              );
            }
            return (
              <div key={i} style={{
                marginBottom: "12px", padding: "10px", borderRadius: "5px",
                backgroundColor: msg.role === "user" ? "#1a3a1a" : "#1a1a3a",
                borderLeft: `3px solid ${msg.role === "user" ? "#4a9eff" : "#ff9e4a"}`
              }}>
                <strong style={{ color: msg.role === "user" ? "#4a9eff" : "#ff9e4a" }}>
                  {msg.role === "user" ? "You" : "Reactor AI"}:
                </strong>
                {msg.pendingApproval && (
                  <div style={{ marginTop: "8px", padding: "8px", background: "#1a1a00", border: "1px solid #facc15", borderRadius: "4px", fontSize: "13px" }}>
                    <span style={{ color: "#facc15" }}>DEFCON Approval Required</span>
                    <div style={{ color: "#ccc", marginTop: "4px" }}>
                      Tool: <code>{msg.pendingApproval.tool}</code><br />
                      Args: <code>{JSON.stringify(msg.pendingApproval.args)}</code><br />
                      Proposal: <code>{msg.pendingApproval.proposalId}</code>
                    </div>
                    {pollingProposal && <div style={{ color: "#facc15", marginTop: "4px", fontSize: "12px" }}>Polling for approval...</div>}
                  </div>
                )}
                <div style={{ marginTop: "5px", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>{msg.content}</div>
              </div>
            );
          })}
          {loading && <div style={{ color: "#888", fontStyle: "italic" }}>Reactor AI is working...</div>}
          <div ref={messagesEndRef} />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder={useTools ? "Ask anything \u2014 AI has tool access via DEFCON One..." : "Ask a question (press Enter to send)..."}
            disabled={loading}
            className="input"
            style={{ flex: 1 }}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()} className="btn btn-primary">
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
