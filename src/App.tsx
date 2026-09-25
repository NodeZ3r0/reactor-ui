import { useState, useEffect, useRef, useMemo } from 'react';
import MonacoEditor from '@monaco-editor/react';
import {
  getHealth,
  getModelsStatus,
  listTasks,
  listDocuments,
  uploadDocument,
  queryDocuments,
  listProjects,
  createMirrorProject,
  runPipeline,
  type DocumentItem,
  type Health,
  type ModelsStatus,
  type TaskItem,
  runMultiAgent,
  type MultiAgentResult,
} from "./api";
import { SimpleRagView } from "./SimpleRagView";
type View = "dashboard" | "pipeline" | "rag";
type RepoProvider = "forgejo" | "github" | "gitlab" | "codeberg" | "custom";
type ReactorProject = {
  id: string;
  name: string;
  provider: RepoProvider;
  repo: string;
  repoUrl: string;
  createdAt: string;
  lastRunAt?: string;
};
const LS_PROJECTS = "reactor.projects.v1";
const LS_ACTIVE_PROJECT = "reactor.activeProjectId.v1";
function nowIso() {
  return new Date().toISOString();
}
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function normalizeRepoUrl(provider: RepoProvider, repo: string, repoUrl: string) {
  const r = (repo || "").trim();
  const u = (repoUrl || "").trim();
  if (provider === "forgejo") {
    return { repo: r, repoUrl: "" };
  }
  if (provider === "custom") {
    return { repo: r, repoUrl: u };
  }
  if (u) return { repo: r, repoUrl: u };
  if (r.startsWith("http://") || r.startsWith("https://")) return { repo: "", repoUrl: r };
  if (r.includes("/")) {
    const base =
      provider === "github" ? "https://github.com/"
      : provider === "gitlab" ? "https://gitlab.com/"
      : provider === "codeberg" ? "https://codeberg.org/"
      : "";
    if (base) return { repo: r, repoUrl: base + r };
  }
  return { repo: r, repoUrl: u };
}
function repoDisplay(p: ReactorProject) {
  if (p.provider === "forgejo") return p.repo || "(repo not set)";
  return p.repoUrl || p.repo || "(repo not set)";
}
function repoLink(p: ReactorProject) {
  if (p.provider === "forgejo") {
    const FORGEJO_PUBLIC_BASE = "https://vault.wopr.systems/";
    const r = (p.repo || "").trim().replace(/^\//, "");
    return r ? FORGEJO_PUBLIC_BASE + r : "";
  }
  return (p.repoUrl || "").trim();
}
function formatAgo(iso?: string) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const ms = Date.now() - t;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function pillClass(ok: boolean | null) {
  return ok === null ? "" : ok ? "ok" : "bad";
}
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const { variant = "primary", className, ...rest } = props;
  return (
    <button
      {...rest}
      className={[
        "btn",
        variant === "primary" ? "btn-primary" : "btn-ghost",
        className || "",
      ].join(" ")}
    />
  );
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={["input", className || ""].join(" ")} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select {...rest} className={["select", className || ""].join(" ")} />;
}
function Panel(props: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{props.title}</div>
        <div className="panel-right">{props.right}</div>
      </div>
      <div className="panel-body">{props.children}</div>
    </div>
  );
}
function Divider() {
  return <div className="divider" />;
}
// ----------------------------------------------------------------------------
// VIEWS
// ----------------------------------------------------------------------------
function ProductOverviewHero() {
  return (
    <header className="overview-hero">
      <h1>Reactor AI — Self-Hosted AI Coding Pipeline That Runs Local LLMs</h1>
      <p>
        Reactor AI is a self-hosted AI coding pipeline. It runs open models locally through Ollama on
        hardware you control, so your source code and your prompts never leave your own infrastructure.
        It is built as an alternative to cloud coding assistants for people who cannot, or would rather
        not, ship their repositories to somebody else&apos;s servers.
      </p>
    </header>
  );
}
function ProductOverview() {
  return (
    <section className="overview-content" aria-label="About Reactor AI">
      <div className="overview-grid">
        <div>
          <h2>What Reactor AI is</h2>
          <p>
            Reactor AI is a control plane for AI-assisted development that you host yourself. Instead of
            calling a vendor API, it drives open models served locally by Ollama and connects them to the
            parts of the job that matter: your repositories, your documents, and your pipeline runs. The
            dashboard above is the same interface you get when you run it — model status, retrieval over
            your own documents, repo operations, and task history in one place.
          </p>
          <h2>Who it is for</h2>
          <p>
            It is for developers and teams whose code cannot go to a third party: client work under NDA,
            regulated work, internal tooling, security research, and anyone who simply wants to keep source
            code private from AI vendors. It also suits people who want a local LLM for coding without
            giving up structure — a repeatable pipeline rather than an ad-hoc chat window. If you went
            looking for a self-hosted alternative to GitHub Copilot and only found autocomplete plugins,
            this is the other half of that problem.
          </p>
        </div>
        <div>
          <h2>How your data and privacy work</h2>
          <p>
            Models run locally through Ollama. Prompts, file contents, and retrieved documents are processed
            on machines you own, with no vendor round-trip in the path. Because you host it, the network
            boundary is yours to draw: you decide what the pipeline is allowed to reach, and you can run the
            whole thing on an isolated network. Privacy here is a property of where the software runs, not a
            policy promise from somebody else.
          </p>
          <h2>Human approval before damaging changes</h2>
          <p>
            Reactor AI integrates DEFCON ONE, a human-in-the-loop approval layer. Damaging changes are gated
            on a person saying yes before they land. A pipeline that can edit repositories and run operations
            needs a stop button that is not the model&apos;s own judgement, and that is what DEFCON ONE is
            there to provide.
          </p>
        </div>
      </div>
      <Divider />
      <h2>Frequently asked questions</h2>
      <dl className="overview-faq">
        <dt>Is Reactor AI a self-hosted alternative to GitHub Copilot?</dt>
        <dd>
          That is what it is built for. The difference is where the model runs. Cloud coding assistants send
          your context to a vendor; Reactor AI runs open models locally through Ollama, on infrastructure you
          own and operate.
        </dd>
        <dt>Which models does it use?</dt>
        <dd>
          Open models served by Ollama. You choose which ones to pull and configure, and Reactor AI
          orchestrates them rather than tying you to one provider.
        </dd>
        <dt>Does my source code leave my network?</dt>
        <dd>
          No. Inference happens locally through Ollama, so code and prompts stay inside your own
          infrastructure instead of being sent to a hosted assistant.
        </dd>
        <dt>What is DEFCON ONE?</dt>
        <dd>
          It is the approval layer Reactor AI integrates so a human signs off before a damaging change lands.
          The pipeline proposes, a person approves, and only then does the change go through.
        </dd>
      </dl>
    </section>
  );
}
function DashboardView(props: {
  health: Health | null;
  modelsStatus: ModelsStatus | null;
  tasks: TaskItem[];
  onRefreshHealth: () => void;
  onRefreshModels: () => void;
  onRefreshTasks: () => void;
}) {
  return (
    <>
      <ProductOverviewHero />
      <div className="main-panels">
      <Panel
        title="System Status"
        right={
          <div className="panel-actions">
            <Button onClick={props.onRefreshHealth}>Refresh Health</Button>
            <Button onClick={props.onRefreshModels} variant="ghost">
              Refresh Models
            </Button>
          </div>
        }
      >
        <div className="kv">
          <div className="kv-row">
            <div className="kv-k">API</div>
            <div className="kv-v">{"/api"}</div>
          </div>
          <div className="kv-row">
            <div className="kv-k">Ollama</div>
            <div className="kv-v">{props.health?.ollama || "unknown"}</div>
          </div>
          <div className="kv-row">
            <div className="kv-k">DB</div>
            <div className="kv-v">{props.health?.database?.status || "unknown"} (docs: {props.health?.database?.documents ?? "?"})</div>
          </div>
          <div className="kv-row">
            <div className="kv-k">Forgejo</div>
            <div className="kv-v">{props.health?.forgejo || "unknown"}</div>
          </div>
          <div className="kv-row">
            <div className="kv-k">MCP</div>
            <div className="kv-v">{props.health?.mcp || "unknown"}</div>
          </div>
          <div className="kv-row">
            <div className="kv-k">RAG</div>
            <div className="kv-v">{props.health?.database?.status === "online" ? "online" : "offline"}</div>
          </div>
          <div className="kv-row">
            <div className="kv-k">Spec Kit</div>
            <div className="kv-v">{props.health?.status === "healthy" ? "online" : "offline"}</div>
          </div>
        </div>
        <Divider />
        <div className="subsection-title">Configured Models</div>
        <div className="chip-list">
          {(props.modelsStatus?.configured_models || []).length ? (
            (props.modelsStatus?.configured_models || []).map((m: string) => (
              <span key={m} className="chip">
                {m}
              </span>
            ))
          ) : (
            <span className="muted">No models list returned by API (endpoint may be unavailable).</span>
          )}
        </div>
      </Panel>
      <Panel
        title="Recent Runs / Tasks"
        right={
          <div className="panel-actions">
            <Button onClick={props.onRefreshTasks}>Refresh</Button>
          </div>
        }
      >
        {props.tasks?.length ? (
          <div className="table">
            <div className="table-head">
              <div>ID</div>
              <div>Status</div>
              <div>Created</div>
              <div>Updated</div>
            </div>
            {props.tasks.slice(0, 50).map((t, idx) => (
              <div className="table-row" key={(t.id as any) ?? idx}>
                <div className="mono">{t.id ?? "—"}</div>
                <div>{t.status ?? "—"}</div>
                <div className="mono">{t.created_at ?? "—"}</div>
                <div className="mono">{t.updated_at ?? "—"}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">No tasks returned (endpoint may be unavailable).</div>
        )}
      </Panel>
      </div>
      <ProductOverview />
    </>
  );
}
function RagView(props: {
  activeProject: ReactorProject | null;
}) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [q, setQ] = useState("");
  const [qLoading, setQLoading] = useState(false);
  const [qResult, setQResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // --- CHECKPOINT 1: Upload State & Duplicate Handling ---
  const [uploading, setUploading] = useState(false);
  const [duplicateFile, setDuplicateFile] = useState<{file: File, metadata: any} | null>(null);
  async function refreshDocs() {
    setDocsLoading(true);
    try {
      const items = await listDocuments();
      setDocs(items);
    } finally {
      setDocsLoading(false);
    }
  }
  useEffect(() => {
    refreshDocs();
  }, []);
  async function performUpload(file: File, metadata: any, overwrite: boolean) {
    setUploading(true);
    try {
      // RAG upload via JSON ingest (no FormData)
      const fileText = await file.text();

      // FIX: Directly hit the MCP backend route that Caddy proxies (/mcp/*)
      // Old: /mcp/api/proxy?path=api/rag/ingest  (doesn't exist on backend)
      const res = await fetch('/mcp/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fileText,
          source: file.name,
        }),
      });

      if (res.status === 409) {
        setDuplicateFile({ file, metadata });
        setUploading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
      }
      if (fileRef.current) fileRef.current.value = "";
      setDuplicateFile(null);
      await refreshDocs();
    } catch (e: any) {
      alert("Error uploading: " + e.message);
    } finally {
      setUploading(false);
    }
  }
  async function onUpload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const p = props.activeProject;
    const metadata = {
      source: "reactor",
      project: p?.name || "",
      provider: p?.provider || "",
      repo: p?.repo || "",
      repo_url: p?.repoUrl || "",
      uploaded_from: "reactor-ui",
      uploaded_at: nowIso(),
    };
    await performUpload(f, metadata, false);
  }
  async function onQuery() {
    const query = q.trim();
    if (!query) return;
    setQLoading(true);
    setQResult(null);
    try {
      const data = await queryDocuments(query, 6);
      setQResult(data);
    } finally {
      setQLoading(false);
    }
  }
  return (
    <div className="main-panels single">
      <Panel
        title="RAG / Documents"
        right={
          <div className="panel-actions">
            <Button onClick={refreshDocs} disabled={docsLoading}>
              {docsLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        }
      >
        <div className="grid2">
          <div>
            <div className="subsection-title">Upload document</div>
            <div className="row">
              <input ref={fileRef} type="file" className="file" />
              <Button onClick={onUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Upload metadata is auto-attached from the active Project (Section A).
            </div>
            <Divider />
            <div className="subsection-title">Query</div>
            <div className="row">
              <TextInput
                placeholder="Ask the corpus…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onQuery();
                }}
              />
              <Button onClick={onQuery} disabled={qLoading}>
                {qLoading ? "Querying..." : "Query"}
              </Button>
            </div>
            {qResult && (
              <pre className="pre">{JSON.stringify(qResult, null, 2)}</pre>
            )}
          </div>
          <div>
            <div className="subsection-title">Saved Documents</div>
            {docs?.length ? (
              <div className="table">
                <div className="table-head">
                  <div>ID</div>
                  <div>Filename</div>
                  <div>Uploaded</div>
                </div>
                {docs.slice(0, 200).map((d) => (
                  <div className="table-row" key={d.id}>
                    <div className="mono">{d.id}</div>
                    <div className="mono">{d.filename}</div>
                    <div className="mono">{formatAgo(d.uploaded_at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No documents yet.</div>
            )}
          </div>
        </div>
        {/* --- CHECKPOINT 1: Duplicate Overwrite Modal --- */}
        {duplicateFile && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-title" style={{ color: '#ffaa00' }}>Duplicate Document</div>
              <div className="form">
                <p>The file <span className="mono">{duplicateFile.file.name}</span> already exists.</p>
                <p>Do you want to overwrite it?</p>
                <div className="modal-actions">
                  <Button onClick={() => setDuplicateFile(null)} variant="ghost">Cancel</Button>
                  <Button onClick={() => performUpload(duplicateFile.file, duplicateFile.metadata, true)}>
                    Overwrite
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
// NEW IDE-STYLE PIPELINE VIEW
// Replace the old PipelineView function with this

// VS CODE STYLE IDE - ACTUALLY LOADS REPOS FROM FORGEJO
// VS CODE STYLE IDE - IMPROVED UI
// VS CODE STYLE IDE - WITH RAG UPLOAD AND DRAGGABLE TERMINAL
function PipelineView(props: {
  projects: ReactorProject[];
  activeProjectId: string | null;
  setActiveProjectId: (id: string) => void;
  upsertProject: (p: ReactorProject) => void;
  updateProject: (id: string, patch: Partial<ReactorProject>) => void;
}) {
  const [repos, setRepos] = useState<Array<{name: string; full_name: string; default_branch: string; category?: string}>>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [branches, setBranches] = useState<Array<{name: string}>>([]);
  const [branch, setBranch] = useState("main");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [files, setFiles] = useState<Array<{path: string; type: string}>>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [modified, setModified] = useState(false);
  const [output, setOutput] = useState("JOSHUA / REACTOR IDE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nHey \u2014 I'm Joshua, your AI coding partner.\nJust type what you need, or use 'help' for commands.\n\n");
  const [showTerminal, setShowTerminal] = useState(true);
  const [showRagPanel, setShowRagPanel] = useState(false);
  const [ragDragging, setRagDragging] = useState(false);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragStatus, setRagStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("qwen2.5-coder:7b");
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [ragPanelWidth, setRagPanelWidth] = useState(280);
  const [resizing, setResizing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{role: string; content: string}>>([]);
  const [showMultiAgent, setShowMultiAgent] = useState(false);
  const [maTask, setMaTask] = useState("");
  const [maRunning, setMaRunning] = useState(false);
  const [multiAgentResult, setMultiAgentResult] = useState<MultiAgentResult | null>(null);
  const [maAutoApply, setMaAutoApply] = useState(false);

  useEffect(() => {
    fetch("/api/forgejo/repos").then(r => r.json()).then(data => {
      setRepos(data.repos || []);
    }).catch(e => setOutput(prev => prev + "[ERROR] " + e + "\n"));
    fetch("/api/ollama/models").then(r => r.json()).then(data => {
      const names = (data.models?.map((m: any) => m.name) || []);
      setModels(names);
      if (names.length > 0) setSelectedModel(names[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setLoadingBranches(true);
    const [owner, repo] = selectedRepo.split("/");
    fetch("/api/forgejo/branches/" + owner + "/" + repo).then(r => r.json()).then(data => setBranches(data.branches || [])).catch(() => setBranches([])).finally(() => setLoadingBranches(false));
  }, [selectedRepo]);

  useEffect(() => {
    if (!selectedRepo || !branch) return;
    setLoadingFiles(true);
    setFiles([]);
    const [owner, repo] = selectedRepo.split("/");
    fetch("/api/forgejo/tree/" + owner + "/" + repo + "?ref=" + encodeURIComponent(branch)).then(r => r.json()).then(data => {
      const tree = data.tree || [];
      setFiles(tree.filter((f: any) => f.type === "blob"));
      setOutput(prev => prev + "[LOADED] " + tree.length + " files from " + repo + " (" + branch + ")\n");
    }).catch(e => setOutput(prev => prev + "[ERROR] " + e + "\n")).finally(() => setLoadingFiles(false));
  }, [selectedRepo, branch]);

  useEffect(() => { if (terminalOutputRef.current) terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight; }, [output]);

  async function openFile(path: string) {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split("/");
    setOutput(prev => prev + "[OPEN] " + path + "\n");
    try {
      const res = await fetch("/api/forgejo/file/" + owner + "/" + repo + "/" + encodeURIComponent(path) + "?ref=" + encodeURIComponent(branch));
      const data = await res.json();
      setCode(data.content || "");
      setCurrentFile(path);
      setModified(false);
      const ext = path.split(".").pop()?.toLowerCase() || "";
      const langMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp", css: "css", scss: "scss", html: "html", json: "json", md: "markdown", yml: "yaml", yaml: "yaml", sh: "shell", bash: "shell", sql: "sql" };
      setLanguage(langMap[ext] || "plaintext");
    } catch (e) { setOutput(prev => prev + "[ERROR] " + e + "\n"); }
  }

  async function uploadToRag(file: File) {
    setRagUploading(true);
    setRagStatus("Uploading " + file.name + "...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/rag/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) { setRagStatus("✓ " + data.message); setOutput(prev => prev + "[RAG] Uploaded: " + file.name + "\n"); }
      else { setRagStatus("✗ " + (data.error || "Upload failed")); }
    } catch (e) { setRagStatus("✗ Error: " + e); }
    finally { setRagUploading(false); setTimeout(() => setRagStatus(null), 5000); }
  }

  function handleRagDrop(e: React.DragEvent) { e.preventDefault(); setRagDragging(false); Array.from(e.dataTransfer.files).forEach(f => uploadToRag(f)); }
  function handleRagFileSelect(e: React.ChangeEvent<HTMLInputElement>) { Array.from(e.target.files || []).forEach(f => uploadToRag(f)); e.target.value = ""; }

  async function uploadCurrentToRag() {
    if (!currentFile || !code) return;
    setRagUploading(true);
    setRagStatus("Indexing " + currentFile + "...");
    try {
      await fetch("/context/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: code, source: currentFile, metadata: { repo: selectedRepo, branch, language } }) });
      setRagStatus("✓ Indexed: " + currentFile);
      setOutput(prev => prev + "[RAG] Indexed: " + currentFile + "\n");
    } catch (e) { setRagStatus("✗ Error: " + e); }
    finally { setRagUploading(false); setTimeout(() => setRagStatus(null), 5000); }
  }

  async function askAI(prompt: string) {
    setOutput(prev => prev + "\n> " + prompt + "\n[Joshua] Thinking...\n");
    try {
      const fileContext = currentFile ? "File: " + currentFile + "\n```" + language + "\n" + code.slice(0, 3000) + "\n```\n\n" : "";
      const userMsg = { role: "user", content: fileContext + prompt };
      const newHistory = [...chatHistory, userMsg];
      setChatHistory(newHistory);
      const messages = [{ role: "system", content: "You are Joshua, the Reactor AI. You are warm, knowledgeable, and direct. You have full access to RAG docs, repos, and server tools. Give clear, actionable answers. Use code blocks. Be helpful like a brilliant friend, not a cold robot." }, ...newHistory.slice(-20)];
      const res = await fetch("/api/ollama/chat-with-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: selectedModel, messages, enable_tools: true }) });
      const text = await res.text();
      const lines = text.trim().split("\n").filter(l => l.trim());
      let finalContent = "";
      const toolResults: string[] = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === "token" && obj.content) finalContent += obj.content;
          else if (obj.type === "final") finalContent = obj.content || finalContent;
          else if (obj.type === "tool_result") toolResults.push("[TOOL:" + (obj.tool || "") + "] " + (obj.output || obj.output_preview || "").slice(0, 200));
          else if (obj.type === "tool_call") toolResults.push("[CALLING:" + (obj.tool || "") + "]");
          else if (obj.type === "error") finalContent = "Error: " + (obj.message || obj.error || "unknown");
          else if (obj.message?.content) finalContent = obj.message.content;
        } catch {}
      }
      const toolInfo = toolResults.length ? "\n" + toolResults.join("\n") + "\n" : "";
      const answer = finalContent || "No response";
      setChatHistory(prev => [...prev, { role: "assistant", content: answer }]);
      setOutput(prev => prev.replace("[Joshua] Thinking...\n", "") + toolInfo + "[Joshua] " + answer + "\n");
    } catch (e) { setOutput(prev => prev.replace("[Joshua] Thinking...\n", "") + "[ERROR] " + e + "\n"); }
  }

  function runCommand() {
    const c = cmd.trim();
    if (!c) return;
    setCmd("");
    if (c.startsWith("ai ") || c.startsWith("ask ")) { askAI(c.replace(/^(ai|ask) /, "")); }
    else if (c === "help") { setOutput(prev => prev + "\nJOSHUA COMMANDS\n━━━━━━━━━━━━━━━━━━━━━━━━\n  Just type naturally    Ask Joshua anything\n  ai <question>          Explicit AI query\n  save                   Save current file\n  index                  Index file to RAG\n  rag                    Toggle RAG panel\n  clear                  Clear terminal\n  help                   This help\n\nTip: You don't need the 'ai' prefix \u2014 just type your question.\n"); }
    else if (c === "clear") { setChatHistory([]); setOutput("JOSHUA / REACTOR IDE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"); }
    else if (c === "rag") { setShowRagPanel(prev => !prev); }
    else if (c === "index" && currentFile) { uploadCurrentToRag(); }
    else if (c === "save" && currentFile && selectedRepo) { saveFile(); }
    else { askAI(c); }
  }

  async function saveFile() {
    if (!currentFile || !selectedRepo) return;
    setOutput(prev => prev + "[SAVE] " + currentFile + "...\n");
    const [owner, repo] = selectedRepo.split("/");
    try {
      const res = await fetch("/api/forgejo/file/" + owner + "/" + repo + "/" + encodeURIComponent(currentFile), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: code, branch, message: "Update " + currentFile + " via Reactor IDE" }) });
      const data = await res.json();
      if (data.error) { setOutput(prev => prev + "[ERROR] " + data.error + "\n"); }
      else { setOutput(prev => prev + "[SAVED] " + currentFile + "\n"); setModified(false); }
    } catch (e) { setOutput(prev => prev + "[ERROR] " + e + "\n"); }
  }

  async function runMultiAgentTask() {
    if (!maTask.trim()) return;
    setMaRunning(true);
    setMultiAgentResult(null);
    setOutput(prev => prev + "\n[MULTI-AGENT] Dispatching: " + maTask.trim() + "\n");
    try {
      const [owner, repo] = selectedRepo ? selectedRepo.split("/") : ["", ""];
      const result = await runMultiAgent({
        task_description: maTask.trim(),
        repo_owner: owner || undefined,
        repo_name: repo || undefined,
        branch: branch || undefined,
        file_paths: currentFile ? [currentFile] : undefined,
        auto_apply: maAutoApply,
      });
      setMultiAgentResult(result);
      if (result.ok) {
        const agents = result.evidence?.agents_dispatched?.join(", ") || "none";
        setOutput(prev => prev + "[MULTI-AGENT] Agents: " + agents + "\n");
        setOutput(prev => prev + "[MULTI-AGENT] " + (result.merged_summary || result.message) + "\n");
        if (result.evidence?.security_veto) {
          setOutput(prev => prev + "[SECURITY] VETOED - proposal blocked\n");
        }
        if (result.risks && result.risks.length > 0) {
          setOutput(prev => prev + "[RISKS] " + result.risks.join("; ") + "\n");
        }
        setOutput(prev => prev + "[MULTI-AGENT] Done in " + (result.duration_ms || 0) + "ms\n");
      } else {
        setOutput(prev => prev + "[ERROR] " + (result.error || "Unknown error") + "\n");
      }
    } catch (e: any) {
      setOutput(prev => prev + "[ERROR] " + e.message + "\n");
    } finally {
      setMaRunning(false);
    }
  }

    const folderTree = useMemo(() => {
    const root: Record<string, any> = { __files: [] };
    files.forEach(f => {
      const parts = f.path.split("/");
      let current = root;
      for (let i = 0; i < parts.length - 1; i++) { if (!current[parts[i]]) current[parts[i]] = { __files: [] }; current = current[parts[i]]; }
      current.__files.push(parts[parts.length - 1]);
    });
    return root;
  }, [files]);

  function toggleFolder(path: string) { setExpandedFolders(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; }); }

  function toggleCategory(cat: string) { setExpandedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); }

  const reposByCategory = (() => {
    const groups: Record<string, typeof repos> = {};
    repos.forEach(r => { const cat = r.category || "Other"; if (!groups[cat]) groups[cat] = []; groups[cat].push(r); });
    return groups;
  })();
  const categoryOrder = ["AI & Dev Tools", "Core Infrastructure", "Social & Communication", "Content & Media", "Business & Productivity", "Storage & Security", "Other"];

  function renderTree(node: Record<string, any>, basePath: string = "", depth: number = 0): JSX.Element[] {
    const items: JSX.Element[] = [];
    Object.keys(node).filter(k => k !== "__files").sort().forEach(folder => {
      const fullPath = basePath ? basePath + "/" + folder : folder;
      const isExpanded = expandedFolders.has(fullPath);
      items.push(<div key={fullPath} className="tree-item folder" style={{ paddingLeft: depth * 16 + 8 }} onClick={() => toggleFolder(fullPath)}><span className="tree-icon">{isExpanded ? "▼" : "▶"}</span><span className="tree-name">{folder}</span></div>);
      if (isExpanded) items.push(...renderTree(node[folder], fullPath, depth + 1));
    });
    (node.__files || []).sort().forEach((file: string) => {
      const fullPath = basePath ? basePath + "/" + file : file;
      items.push(<div key={fullPath} className={"tree-item file " + (currentFile === fullPath ? "active" : "")} style={{ paddingLeft: depth * 16 + 8 }} onClick={() => openFile(fullPath)}><span className="tree-icon">◆</span><span className="tree-name">{file}</span></div>);
    });
    return items;
  }

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (resizing === "sidebar") setSidebarWidth(Math.min(400, Math.max(150, e.clientX - rect.left)));
      else if (resizing === "terminal") setTerminalHeight(Math.min(500, Math.max(120, rect.bottom - e.clientY)));
      else if (resizing === "rag") setRagPanelWidth(Math.min(400, Math.max(200, rect.right - e.clientX)));
    };
    const handleMouseUp = () => setResizing(null);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, [resizing]);

  const getRepoName = (fullName: string) => fullName.split("/").pop() || fullName;

  return (
    <div className="vscode-ide" ref={containerRef}>
      <div className="vscode-topbar">
        <div className="vscode-repo-select">
          <span className="repo-label">{selectedRepo ? selectedRepo.split("/").pop() : "No repo"}</span>
        </div>

        <div className="vscode-model">
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="vscode-file-indicator">
          {currentFile ? <span>{currentFile} {modified ? "●" : ""}</span> : <span className="muted">No file</span>}
        </div>
        <button className={"ma-toggle-btn" + (showMultiAgent ? " active" : "")} onClick={() => setShowMultiAgent(p => !p)}>{showMultiAgent ? "Agents ON" : "Agents"}</button>
        <button className="rag-toggle-btn" onClick={() => setShowRagPanel(p => !p)}>{showRagPanel ? "◀ RAG" : "RAG ▶"}</button>
      </div>
      <div className="vscode-main">
        <div className="vscode-sidebar" style={{ width: sidebarWidth }}>
          <div className="vscode-sidebar-header">REPOS</div>
          <div className="repo-browser">
            {categoryOrder.filter(cat => reposByCategory[cat]?.length).map(cat => (
              <div key={cat} className="repo-category">
                <div className="repo-category-header" onClick={() => toggleCategory(cat)}>
                  <span className="tree-icon">{expandedCategories.has(cat) ? "\u25BC" : "\u25B6"}</span>
                  <span className="cat-name">{cat}</span>
                  <span className="cat-count">{reposByCategory[cat].length}</span>
                </div>
                {expandedCategories.has(cat) && reposByCategory[cat].map(r => (
                  <div key={r.full_name} className={"repo-item" + (selectedRepo === r.full_name ? " active" : "")} onClick={() => { setSelectedRepo(r.full_name); setBranch(r.default_branch || "main"); }}>
                    {r.name.replace("wopr-", "")}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {selectedRepo && <>
            <div className="vscode-sidebar-header">FILES <span className="file-count">({files.length})</span>
              <select className="branch-inline" value={branch} onChange={e => setBranch(e.target.value)} disabled={loadingBranches}>
                {branches.length === 0 && <option value={branch}>{branch}</option>}
                {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className="vscode-file-tree">{loadingFiles ? <div className="vscode-loading">Loading...</div> : files.length === 0 ? <div className="vscode-empty">No files</div> : renderTree(folderTree)}</div>
          </>}
          <div className="resize-handle-v" onMouseDown={() => setResizing("sidebar")} />
        </div>
        <div className="vscode-editor-area">
          {currentFile ? (
            <div className="vscode-editor" style={{ flex: 1 }}>
              <MonacoEditor height="100%" language={language} value={code} onChange={v => { setCode(v || ""); setModified(true); }} theme="vs-dark" options={{ minimap: { enabled: window.innerWidth > 900 }, fontSize: 13, wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2 }} />
            </div>
          ) : null}
          {(showTerminal || !currentFile) && (
            <div className={"reactor-terminal" + (!currentFile ? " terminal-full" : "")} style={currentFile ? { height: terminalHeight } : { flex: 1 }}>
              <div className="terminal-drag-handle" onMouseDown={() => setResizing("terminal")}>
                <span className="drag-indicator">═══ JOSHUA ═══</span>
                <button onClick={() => setShowTerminal(false)}>×</button>
              </div>
              <div className="terminal-output" ref={terminalOutputRef}><pre>{output}</pre></div>
              <div className="terminal-input-box">
                <span className="terminal-prompt">❯</span>
                <textarea value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runCommand(); } }} placeholder="Ask Joshua anything, or type a command..." rows={2} />
                <button className="terminal-send" onClick={runCommand}>▶</button>
              </div>
            </div>
          )}
        </div>
        {showMultiAgent && (
          <div className="multi-agent-panel">
            <div className="ma-header"><span>Multi-Agent Pipeline</span><button onClick={() => setShowMultiAgent(false)}>x</button></div>
            <div className="ma-task-input">
              <textarea value={maTask} onChange={e => setMaTask(e.target.value)} placeholder="Describe the coding task for the agent team..." rows={3} disabled={maRunning} />
              <div className="ma-controls">
                <label className="ma-checkbox"><input type="checkbox" checked={maAutoApply} onChange={e => setMaAutoApply(e.target.checked)} /><span>Auto-apply (DEFCON)</span></label>
                <button className="ma-run-btn" onClick={runMultiAgentTask} disabled={maRunning || !maTask.trim()}>{maRunning ? "Running..." : "Run Agents"}</button>
              </div>
            </div>
            {multiAgentResult && (
              <div className="ma-results">
                <div className={"ma-status " + (multiAgentResult.ok ? (multiAgentResult.status === "vetoed" ? "vetoed" : "ok") : "error")}>
                  {multiAgentResult.status === "vetoed" ? "VETOED" : multiAgentResult.ok ? "OK" : "ERROR"} - {multiAgentResult.message}
                </div>
                {multiAgentResult.evidence && (
                  <div className="ma-agents">
                    {multiAgentResult.evidence.agents_dispatched?.map((a: string) => {
                      const responded = multiAgentResult.evidence.agents_responded?.includes(a);
                      const hasError = multiAgentResult.evidence.errors?.some((e: any) => e.agent === a);
                      const proposal = multiAgentResult.individual_proposals?.[a];
                      return (<div key={a} className={"ma-agent-chip " + (hasError ? "error" : responded ? "ok" : "pending")}>
                        <span className="ma-agent-name">{a.replace("_specialist", "").replace("_reviewer", " review")}</span>
                        {proposal?.summary && <span className="ma-agent-summary">{proposal.summary.slice(0, 80)}</span>}
                      </div>);
                    })}
                  </div>
                )}
                {multiAgentResult.evidence?.security_findings?.length > 0 && (
                  <div className="ma-findings">
                    <div className="ma-section-title">Security Findings</div>
                    {multiAgentResult.evidence.security_findings.map((f: any, i: number) => (
                      <div key={i} className={"ma-finding " + (f.severity || "").toLowerCase()}>{f.severity}: {f.description}</div>
                    ))}
                  </div>
                )}
                {multiAgentResult.risks && multiAgentResult.risks.length > 0 && (
                  <div className="ma-risks">
                    <div className="ma-section-title">Risks</div>
                    {multiAgentResult.risks.map((r: string, i: number) => <div key={i} className="ma-risk">{r}</div>)}
                  </div>
                )}
                {multiAgentResult.unified_diff && (
                  <div className="ma-diff">
                    <div className="ma-section-title">Proposed Changes ({multiAgentResult.files_touched?.length || 0} files)</div>
                    <pre className="ma-diff-content">{multiAgentResult.unified_diff}</pre>
                  </div>
                )}
                {multiAgentResult.test_commands && multiAgentResult.test_commands.length > 0 && (
                  <div className="ma-tests">
                    <div className="ma-section-title">Test Commands</div>
                    {multiAgentResult.test_commands.map((t: string, i: number) => <div key={i} className="ma-test-cmd mono">{t}</div>)}
                  </div>
                )}
                <div className="ma-meta">
                  Run: {multiAgentResult.run_id} | {multiAgentResult.duration_ms}ms
                </div>
              </div>
            )}
          </div>
        )}
        {showRagPanel && (
          <div className="rag-panel" style={{ width: ragPanelWidth }}>
            <div className="resize-handle-rag" onMouseDown={() => setResizing("rag")} />
            <div className="rag-header"><span>◈ RAG UPLOAD</span><button onClick={() => setShowRagPanel(false)}>×</button></div>
            <div className={"rag-dropzone " + (ragDragging ? "dragging" : "")} onDragOver={e => { e.preventDefault(); setRagDragging(true); }} onDragLeave={() => setRagDragging(false)} onDrop={handleRagDrop} onClick={() => fileInputRef.current?.click()}>
              <input type="file" ref={fileInputRef} onChange={handleRagFileSelect} multiple hidden />
              <div className="dropzone-content"><span className="dropzone-icon">⬆</span><span className="dropzone-text">Drop files here</span><span className="dropzone-subtext">or click to browse</span></div>
            </div>
            {ragStatus && <div className={"rag-status " + (ragStatus.startsWith("✓") ? "success" : ragStatus.startsWith("✗") ? "error" : "")}>{ragStatus}</div>}
            {currentFile && <button className="rag-index-btn" onClick={uploadCurrentToRag} disabled={ragUploading}>{ragUploading ? "Indexing..." : "Index: " + currentFile.split("/").pop()}</button>}
            <div className="rag-info"><p>Supported: txt, md, py, js, ts, json, yaml, html, css, sql, pdf</p></div>
          </div>
        )}
      </div>
      <div className="vscode-statusbar">
        <span>{selectedRepo ? getRepoName(selectedRepo) : "No repo"}</span>
        <span>{branch}</span>
        <span>{language}</span>
        <span>{files.length} files</span>
        {!showTerminal && <button onClick={() => setShowTerminal(true)}>Joshua</button>}
      </div>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [projects, setProjects] = useState<ReactorProject[]>(() =>
    safeJsonParse<ReactorProject[]>(localStorage.getItem(LS_PROJECTS), [])
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    localStorage.getItem(LS_ACTIVE_PROJECT) || null
  );
  useEffect(() => {
    localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
  }, [projects]);
  useEffect(() => {
    if (activeProjectId) localStorage.setItem(LS_ACTIVE_PROJECT, activeProjectId);
  }, [activeProjectId]);
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );
  function upsertProject(p: ReactorProject) {
    setProjects((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i === -1) return [p, ...prev];
      const copy = [...prev];
      copy[i] = p;
      return copy;
    });
  }
  function updateProject(id: string, patch: Partial<ReactorProject>) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }
  async function refreshHealth() {
    setHealthLoading(true);
    try {
      setHealth(await getHealth());
    } finally {
      setHealthLoading(false);
    }
  }
  async function refreshModels() {
    setModelsLoading(true);
    try {
      setModelsStatus(await getModelsStatus());
    } finally {
      setModelsLoading(false);
    }
  }
  async function refreshTasks() {
    setTasksLoading(true);
    try {
      setTasks(await listTasks());
    } finally {
      setTasksLoading(false);
    }
  }
  async function refreshProjects() {
    try {
      const result = await listProjects();
      if (result.projects && result.projects.length > 0) {
        // Merge Forgejo projects with existing localStorage projects
        const forgejoProjects = result.projects.map(p => ({
          id: p.id,
          name: p.name,
          provider: p.provider as RepoProvider,
          repo: p.name,
          repoUrl: `https://vault.wopr.systems/${p.id}`,
          createdAt: new Date().toISOString()
        }));
        setProjects(prev => {
          // Keep local projects, add new Forgejo ones
          const combined = [...prev];
          forgejoProjects.forEach(fp => {
            if (!combined.find(p => p.id === fp.id)) {
              combined.push(fp);
            }
          });
          return combined;
        });
      }
    } catch (error) {
      console.error('Failed to fetch projects from Forgejo:', error);
    }
  }
  useEffect(() => {
    refreshHealth();
    refreshModels();
    refreshTasks();
    refreshProjects();
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
      if (e.key === "F1") {
        e.preventDefault();
        setActiveView("dashboard");
        setSidebarOpen(false);
      }
      if (e.key === "F2") {
        e.preventDefault();
        setActiveView("pipeline");
        setSidebarOpen(false);
      }
      if (e.key === "F3") {
        e.preventDefault();
        setActiveView("rag");
        setSidebarOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const ollamaOk = health?.ollama === "online" ? true : health ? false : null;
  const dbOk = health?.database?.status === "online" ? true : health ? false : null;
  return (
    <div className="app-root">
      <button
        className="hamburger"
        onClick={() => setSidebarOpen((s) => !s)}
        aria-label="Open menu"
      >
        ☰
      </button>
      {sidebarOpen && <div className="sidebar-overlay" onMouseDown={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo">
          <img
            src="https://wopr.systems/wopr-logo.png?v=20260925green"
            alt="WOPR"
            className="logo-img"
          />
        </div>
        <div>
          <div className="sidebar-section-title">Views</div>
          <div className="sidebar-nav">
            <button
              className={"sidebar-button" + (activeView === "dashboard" ? " active" : "")}
              onClick={() => {
                setActiveView("dashboard");
                setSidebarOpen(false);
              }}
            >
              <span>Dashboard</span>
              <span className="key">[F1]</span>
            </button>
            <button
              className={"sidebar-button" + (activeView === "pipeline" ? " active" : "")}
              onClick={() => {
                setActiveView("pipeline");
                setSidebarOpen(false);
              }}
            >
              <span>Pipeline & Editor</span>
              <span className="key">[F2]</span>
            </button>
            <button
              className={"sidebar-button" + (activeView === "rag" ? " active" : "")}
              onClick={() => {
                setActiveView("rag");
                setSidebarOpen(false);
              }}
            >
              <span>RAG / Docs</span>
              <span className="key">[F3]</span>
            </button>
          </div>
        </div>
        <div>
          <div className="sidebar-section-title">Models</div>
          <div className="chip-list">
            {modelsLoading ? (
              <span className="muted">loading…</span>
            ) : (modelsStatus?.configured_models || []).length ? (
              (modelsStatus?.configured_models || []).map((m: string) => (
                <span key={m} className="chip">
                  {m}
                </span>
              ))
            ) : (
              <span className="muted">unavailable</span>
            )}
          </div>
        </div>
        <div>
          <div className="sidebar-section-title">Active Project</div>
          <div className="active-project-card">
            <div className="mono">{activeProject?.name || "—"}</div>
            <div className="muted small">{activeProject ? repoDisplay(activeProject) : "Select in Pipeline"}</div>
          </div>
        </div>
        <div className="sidebar-footer">
          <div>NodeZ3r0 · Reactor AI</div>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
            API: {"/api"}
          </div>
        </div>
      </aside>
      <main className="main-shell">
        <div className="top-bar">
          <div className="top-bar-left">
            <div className="top-bar-title">
              <div>ReactorAI™</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>
                by NodeZ3r0 @ WOPR Systems
              </div>
            </div>
            <div className="top-bar-subtitle">Multi-model pipeline · RAG · Repo operations</div>
          </div>
          <div className="top-bar-right">
            <div className="env-pill">env: {import.meta.env.VITE_REACTOR_ENV_LABEL || "NODEZ3R0 / Rig"}</div>
            <div className="health-chip">
              <span className={"health-dot " + pillClass(ollamaOk && dbOk ? true : ollamaOk === null ? null : false)} />
              <span>
                {healthLoading
                  ? "Checking health..."
                  : health
                  ? `Ollama: ${health.ollama} · DB: ${health.database?.status ?? "unknown"}`
                  : "No health data"}
              </span>
            </div>
            <Button onClick={refreshHealth} variant="ghost">
              Health
            </Button>
          </div>
        </div>
        {activeView === "dashboard" && (
          <DashboardView
            health={health}
            modelsStatus={modelsStatus}
            tasks={tasks}
            onRefreshHealth={refreshHealth}
            onRefreshModels={refreshModels}
            onRefreshTasks={refreshTasks}
          />
        )}
        {activeView === "pipeline" && (
          <PipelineView
            projects={projects}
            activeProjectId={activeProjectId}
            setActiveProjectId={(id) => setActiveProjectId(id)}
            upsertProject={upsertProject}
            updateProject={updateProject}
          />
        )}
        {activeView === "rag" && (
          <SimpleRagView
            activeProject={activeProject}
            projects={projects}
            setActiveProjectId={setActiveProjectId}
            onNewProject={() => setActiveView("pipeline")}
            upsertProject={upsertProject}
          />
        )}
      </main>
    </div>
  );
}
