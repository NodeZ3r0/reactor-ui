const MCP_BASE = "/api";
const RAG_BASE = "/context";


async function j(res: Response): Promise<any> {
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${t}`);
  }
  return res.json();
}

export type Health = {
  status: string;
  ollama?: string;
  forgejo?: string;
  mcp?: string;
  database?: {
    status?: string;
    documents?: number;
  };
};

export type ModelsStatus = {
  configured_models?: string[];
};

export type TaskItem = {
  id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export type DocumentItem = {
  id: string;
  filename: string;
  uploaded_at: string;
};

export async function getHealth(): Promise<Health> {
  return normalizeHealth(await j(await fetch(`/health`)));
}

export async function getModelsStatus(): Promise<ModelsStatus> {
  return j(await fetch(`/api/models/status`));
}

export async function listTasks(): Promise<TaskItem[]> {
  return j(await fetch(`${MCP_BASE}/tasks`));
}

export async function listDocuments(): Promise<DocumentItem[]> {
  return j(await fetch(`${MCP_BASE}/documents`));
}

export async function uploadDocument(text: string, source?: string) {
  return j(
    await fetch(`${RAG_BASE}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source }),
    })
  );
}

export async function queryDocuments(query: string, limit = 5) {
  return j(
    await fetch(`${RAG_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    })
  );
}

export async function runPipeline(payload: any): Promise<any> {
  return j(
    await fetch(`${MCP_BASE}/build/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}


function normalizeHealth(h:any){
  if(!h) return h;
  return {
    status: h.status,
    ollama: h.ollama,
    forgejo: h.forgejo,
    mcp: h.mcp,
    database: typeof h.database === "string"
      ? { status: h.database, documents: 0 }
      : h.database
  }
}

function normalizeModels(m:any){
  if(!m) return m;
  return {
    configured_models: m.models || []
  }
}

// Ollama LLM API
export type OllamaModel = {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  context?: string[];  // RAG context chunks
};

export type CompletionRequest = {
  model: string;
  prompt: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  context?: string[];  // RAG context chunks
};

export async function listOllamaModels(): Promise<{ models: OllamaModel[]; count: number }> {
  return j(await fetch(`/api/ollama/models`));
}

export async function chatCompletion(request: ChatRequest): Promise<any> {
  return j(
    await fetch(`/api/ollama/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
  );
}

export async function textCompletion(request: CompletionRequest): Promise<any> {
  return j(
    await fetch(`/api/ollama/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
  );
}

export async function getOllamaHealth(): Promise<{ status: string; base_url: string; models_available?: number; error?: string }> {
  return j(await fetch(`/api/ollama/health`));
}

export async function listAllDocuments() {
  const result = await queryDocuments("", 1000);
  return result.results || [];
}
