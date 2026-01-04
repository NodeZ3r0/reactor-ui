const MCP_BASE = "/api";
const RAG_BASE = "/mcp";


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
  return j(await fetch(`${MCP_BASE}/health`));
}

export async function getModelsStatus(): Promise<ModelsStatus> {
  return j(await fetch(`${MCP_BASE}/models/status`));
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
    await fetch(`${MCP_BASE}/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}
