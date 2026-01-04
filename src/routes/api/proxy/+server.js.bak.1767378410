import { json } from '@sveltejs/kit';

const BACKEND = process.env.MCP_BACKEND || 'http://127.0.0.1:7003';
const API_KEY = process.env.MCP_API_KEY || 'test-key-123';

async function forward(request, url) {
  const targetPath = url.searchParams.get('path') || '';
  const target = `${BACKEND}/${targetPath.replace(/^\/+/,'')}`;

  const headers = new Headers(request.headers);
  headers.set('X-API-Key', API_KEY);

  // prevent bad forwarded headers
  headers.delete('host');
  headers.delete('content-length');

  const init = {
    method: request.method,
    headers,
    body: (request.method === 'GET' || request.method === 'HEAD')
      ? undefined
      : await request.arrayBuffer()
  };

  // Node adapter: use global fetch
  const resp = await globalThis.fetch(target, init);

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await resp.json();
    return json(data, { status: resp.status });
  }

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'content-type': contentType || 'text/plain' }
  });
}

export async function GET({ request, url }) { return forward(request, url); }
export async function POST({ request, url }) { return forward(request, url); }
export async function PUT({ request, url }) { return forward(request, url); }
export async function PATCH({ request, url }) { return forward(request, url); }
export async function DELETE({ request, url }) { return forward(request, url); }
