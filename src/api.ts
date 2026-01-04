/**
 * Reactor UI → MCP API adapter
 * Keeps App.tsx happy while routing everything through MCP proxy
 */

const MCP_BASE = '/mcp/api/proxy?path=api';

async function mcp<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MCP_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${t}`);
  }

  return res.json() as Promise<T>;
}

/* ===== Types expected by App.tsx ===== */

export interface Health {
  status: string;
  version: string;
  ollama: string;
  mcp: string;
  forgejo: string;
  database: {
    status: string;
    documents: number;
  };
  models: Record<string, any>;
}

export interface ModelsStatus {
  status: string;
  available_models: string[];
  configured_models: string[];
  missing_models: string[];
}

export interface DocumentStats {
  total_documents: number;
  total_chunks: number;
}

export interface DocumentItem {
  id: number;
  filename: string;
  uploaded_at: string;
  metadata: Record<string, any>;
}

export interface TaskItem {
  id: number;
  name: string;
  status: string;
  created_at: string;
  updated_at?: string;
}

export interface PipelineResponse {
  code?: string;
  generated_code?: string;
  output_code?: string;
  result?: any;
  status?: string;
  run_id?: string;
  output?: any;
  [key: string]: any;

  rag_used?: boolean;

  rag_sources?: string[];

  rag_context?: string;
}

/* ===== MCP-native ===== */

type McpRun = {
  run_id: string;
  created: number;
  input: any;
  output: any;
};

function iso(ts: number): string {
  return new Date((ts > 1e12 ? ts : ts * 1000)).toISOString();
}

/* ===== API exports ===== */

export const getHealth = async (): Promise<Health> => {
  const raw = await mcp<any>('/health');
  return {
    status: raw?.status ?? 'ok',
    version: raw?.version ?? 'unknown',
    ollama: raw?.ollama ?? 'unknown',
    mcp: raw?.mcp ?? 'online',
    forgejo: raw?.forgejo ?? 'unknown',
    database: raw?.database ?? { status: 'unknown', documents: 0 },
    models: raw?.models ?? {},
  };
};

export const getModelsStatus = async (): Promise<ModelsStatus> => {
  try {
    const raw = await mcp<any>('/models/status');
    return {
      status: raw?.status ?? 'unknown',
      available_models: raw?.available_models ?? [],
      configured_models: raw?.configured_models ?? [],
      missing_models: raw?.missing_models ?? [],
    };
  } catch {
    return {
      status: 'unknown',
      available_models: [],
      configured_models: [],
      missing_models: [],
    };
  }
};

export const getDocumentStats = async (): Promise<DocumentStats> => {
  const raw = await mcp<{ runs?: McpRun[] }>('/runs');
  const runs = raw?.runs ?? [];
  return { total_documents: runs.length, total_chunks: 0 };
};

export const listDocuments = async (): Promise<DocumentItem[]> => {
  const raw = await mcp<{ runs?: McpRun[] }>('/runs');
  const runs = raw?.runs ?? [];
  return runs.map((r, i) => ({
    id: i + 1,
    filename: r.run_id,
    uploaded_at: iso(r.created),
    metadata: r.input,
  }));
};

export const queryDocuments = async (query: string, limit = 5): Promise<DocumentItem[]> => {
  const all = await listDocuments();
  const q = query.toLowerCase();
  return all.filter(d => d.filename.toLowerCase().includes(q)).slice(0, limit);
};

export const uploadDocument = async (file: File, metadata: Record<string, any>) => {
  /* FormData removed: using JSON ingest */

  const res = await fetch('/mcp/api/proxy?path=api/rag/upload', {
    method: 'POST',
    
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload failed: ${res.status} ${t}`);
  }

  return res.json();
};

export const listTasks = async (): Promise<TaskItem[]> => {
  const raw = await mcp<{ runs?: McpRun[] }>('/runs');
  const runs = raw?.runs ?? [];
  return runs.map((r, i) => ({
    id: i + 1,
    name: r.input?.task ?? r.run_id,
    status: r.output?.status ?? 'completed',
    created_at: iso(r.created),
    updated_at: iso(r.created),
  }));
};

export const runPipeline = (payload: any): Promise<PipelineResponse> =>
  mcp<PipelineResponse>('/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
