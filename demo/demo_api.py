"""Reactor AI public demo backend (reactorai.app).

Answers every endpoint the Reactor UI calls with SAMPLE data so the demo shows health, API,
Ollama connections and models - without touching the live Reactor. No LLM, no keys, no network
calls, nothing stored. Joshua gives a few set answers, then hands off to the contact page.
Standard library only.
"""
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONTACT = "https://wopr.systems/contact"
FREE_QUESTIONS = 3
MAX_BODY = 256 * 1024

MODELS = [
    {"name": "qwen2.5-coder:14b", "size": 8988124069, "digest": "demo-qwen25coder14b", "modified_at": "2026-09-20T09:12:00Z"},
    {"name": "deepseek-coder-v2:16b", "size": 8905126121, "digest": "demo-deepseekcoderv2", "modified_at": "2026-09-18T14:40:00Z"},
    {"name": "llama3.1:8b", "size": 4920753328, "digest": "demo-llama31-8b", "modified_at": "2026-09-15T08:05:00Z"},
    {"name": "nomic-embed-text:latest", "size": 274302450, "digest": "demo-nomic-embed", "modified_at": "2026-09-10T11:30:00Z"},
]

REPOS = [
    {"name": "demo-api", "full_name": "demo/demo-api", "default_branch": "main", "category": "AI & Dev Tools"},
    {"name": "demo-web", "full_name": "demo/demo-web", "default_branch": "main", "category": "Business & Productivity"},
    {"name": "demo-infra", "full_name": "demo/demo-infra", "default_branch": "main", "category": "Core Infrastructure"},
]

TREE = [
    {"path": "README.md", "type": "blob"},
    {"path": "src", "type": "tree"},
    {"path": "src/app.py", "type": "blob"},
    {"path": "src/auth.py", "type": "blob"},
    {"path": "tests/test_auth.py", "type": "blob"},
]

FILES = {
    "README.md": "# Demo project\n\nSample repository shown in the Reactor AI public demo.\n"
                 "In the live product this panel opens files from your own Git server.\n",
    "src/app.py": "from auth import check_token\n\n\ndef handle(request):\n"
                  "    if not check_token(request.headers.get('Authorization')):\n"
                  "        return 401, 'unauthorized'\n    return 200, 'ok'\n",
    "src/auth.py": "import hmac\n\nSECRET = b'demo-only'\n\n\ndef check_token(header):\n"
                   "    if not header or not header.startswith('Bearer '):\n        return False\n"
                   "    token = header[7:].encode()\n    return hmac.compare_digest(token, SECRET)\n",
    "tests/test_auth.py": "from src.auth import check_token\n\n\ndef test_rejects_missing():\n"
                          "    assert not check_token(None)\n",
}

DOCS = [
    {"id": "1", "content": "Reactor AI runs open models locally through Ollama. Code and prompts stay on infrastructure you control.",
     "source": "demo-api/README.md", "metadata": {"project_name": "demo-api", "filename": "README.md"}, "score": 0.91},
    {"id": "2", "content": "DEFCON ONE: the pipeline proposes a change, a person approves it, and only then does it land.",
     "source": "demo-api/docs/defcon-one.md", "metadata": {"project_name": "demo-api", "filename": "defcon-one.md"}, "score": 0.84},
    {"id": "3", "content": "Agents mode sends one task to planning, code, review and security agents and merges their proposals.",
     "source": "demo-web/docs/agents.md", "metadata": {"project_name": "demo-web", "filename": "agents.md"}, "score": 0.77},
]

TOPICS = [
    (r"\b(price|pricing|cost|buy|purchase|license|trial|install|set ?up|setup|hire|get (it|reactor|started)|sign up|how do i get)\b",
     "Reactor AI is set up on your own hardware or private server. For pricing and setup, get in touch: " + CONTACT),
    (r"\b(defcon|approv\w*|safe\w*|stop button|damag\w*|destructive|human)\b",
     "DEFCON ONE is Reactor's human approval layer. The pipeline proposes a change, a person approves it, and only "
     "then does it land. Anything that could do damage waits for a yes."),
    (r"\b(leave|leaves|network|cloud|privacy|private|nda|data|secure|security|vendor|local\w*|self[- ]?host\w*)\b",
     "No, your code does not leave your network. Inference runs locally through Ollama, so code and prompts stay on "
     "infrastructure you control instead of going to a hosted assistant."),
    (r"\b(model|models|llm|ollama|gpt|qwen|llama|deepseek|which ai|what ai)\b",
     "Open models served by Ollama on your own machine. The list on the left is demo data: qwen2.5-coder, "
     "deepseek-coder-v2, llama3.1 and an embedding model for search. You choose which models to pull, and Reactor "
     "assigns them to jobs like planning, writing and reviewing code."),
    (r"\b(rag|docs?|documents?|knowledge|upload\w*)\b",
     "RAG is Reactor's document library. You add specs, READMEs and notes; Reactor indexes them and pulls the "
     "relevant parts into each answer, so the model works from your own documentation. Uploads are switched off in "
     "this demo."),
    (r"\b(agent|agents|multi)\b",
     "Agents mode sends one task to several specialist agents (planning, code, review, security) and merges their "
     "proposals into one change, with a security veto. In this demo a run returns a sample result."),
    (r"\b(write|fix|debug|refactor|function|bug|error|code|implement|build)\b",
     "In the live product I would work on your repository right here. This demo is not connected to a model, so I "
     "cannot write or run code. To try Reactor on your own code: " + CONTACT),
    (r"\b(what is|what's|whats|what does|tell me about|explain|features?|what can you)\b",
     "Reactor AI is a self-hosted AI coding pipeline. It runs open models on hardware you own, reads your "
     "repositories, keeps a RAG library of your docs, and can plan, write and review code with several agents "
     "working together. Changes that could do damage wait for a person to approve them (DEFCON ONE)."),
    (r"\b(hi|hello|hey|yo|sup|who are you|joshua)\b",
     "Hi, I'm Joshua, Reactor AI's coding partner. This is the public demo: the panels show sample data and I answer "
     "a few set questions. Try: what is Reactor AI? which models does it use? does my code leave my network? "
     "what is DEFCON ONE?"),
]

FALLBACK = ("I'm the demo version of Joshua, so I can only answer a few set questions: what Reactor AI is, which "
            "models it runs, whether your code leaves your network, how DEFCON ONE approval works, and how to get it. "
            "For anything else: " + CONTACT)
HANDOFF = ("That's as far as the demo goes. To see Reactor AI working on your own code, or to ask anything else, "
           "get in touch: " + CONTACT)


def joshua(messages):
    users = [m for m in messages if isinstance(m, dict) and m.get("role") == "user"]
    if len(users) > FREE_QUESTIONS:
        return HANDOFF
    text = str(users[-1].get("content", "")) if users else ""
    text = re.sub(r"(?s)^File: .*?```.*?```\s*", "", text).lower()
    answer = FALLBACK
    for pattern, reply in TOPICS:
        if re.search(pattern, text):
            answer = reply
            break
    if len(users) == FREE_QUESTIONS and CONTACT not in answer:
        answer += "\n\nWant more than the demo can show? " + CONTACT
    return answer


def chat_reply(messages):
    answer = joshua(messages)
    return {"type": "final", "content": answer, "status": "complete", "done": True,
            "message": {"role": "assistant", "content": answer}, "tool_log": []}


MULTI_AGENT = {
    "ok": True, "run_id": "demo-run", "status": "demo",
    "message": "Sample result - the demo does not run agents.",
    "merged_summary": "Demo run. In the live product the planning, code, review and security agents each propose a "
                      "change and Reactor merges them into one diff for a person to approve. Want to see it on your "
                      "own repository? " + CONTACT,
    "files_touched": ["src/auth.py"], "risks": ["Sample data only"], "test_commands": ["pytest tests/"],
    "unified_diff": "", "individual_proposals": {}, "duration_ms": 0, "security_findings": [],
    "evidence": {"run_id": "demo-run", "task": "demo", "agents_dispatched": ["planner", "coder", "reviewer", "security"],
                 "agents_responded": ["planner", "coder", "reviewer", "security"], "errors": [],
                 "security_veto": False, "security_findings": [], "merged_summary": "Sample result",
                 "merged_files_touched": ["src/auth.py"], "merged_risks": [], "merged_test_commands": ["pytest tests/"],
                 "has_diff": False, "duration_ms": 0},
}

DISABLED = "Switched off in the demo. Want Reactor on your own code? " + CONTACT


class Handler(BaseHTTPRequestHandler):
    server_version = "reactor-demo"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass

    def send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        try:
            n = min(int(self.headers.get("Content-Length") or 0), MAX_BODY)
            raw = self.rfile.read(n) if n else b""
            return json.loads(raw or b"{}")
        except Exception:
            return {}

    def route(self, method):
        path = self.path.split("?", 1)[0]
        if path in ("/health", "/api/health"):
            return self.send({"status": "healthy", "version": "demo", "ollama": "online", "mcp": "online",
                              "forgejo": "online", "database": {"status": "online", "documents": len(DOCS)}, "demo": True})
        if path in ("/models", "/api/models/status"):
            return self.send({"configured_models": [m["name"] for m in MODELS[:3]], "models": [m["name"] for m in MODELS]})
        if path == "/api/ollama/models":
            return self.send({"models": MODELS, "count": len(MODELS)})
        if path == "/api/ollama/health":
            return self.send({"status": "online", "base_url": "http://ollama:11434 (demo)", "models_available": len(MODELS)})
        if path in ("/api/ollama/chat-with-tools", "/api/ollama/chat-continue", "/api/ollama/chat", "/api/ollama/complete"):
            data = self.body() if method == "POST" else {}
            msgs = data.get("messages") or ([{"role": "user", "content": data.get("prompt", "")}] if data.get("prompt") else [])
            return self.send(chat_reply(msgs))
        if path == "/api/forgejo/repos":
            return self.send({"repos": REPOS})
        if path.startswith("/api/forgejo/branches/"):
            return self.send({"branches": [{"name": "main"}, {"name": "feature/rate-limits"}]})
        if path.startswith("/api/forgejo/tree/"):
            return self.send({"tree": TREE})
        if path.startswith("/api/forgejo/file/"):
            if method != "GET":
                return self.send({"error": DISABLED})
            rel = "/".join(path.split("/")[6:])
            from urllib.parse import unquote
            rel = unquote(rel)
            return self.send({"content": FILES.get(rel, "# Sample file (demo)\n")})
        if path == "/api/tasks":
            return self.send([
                {"id": "run-0142", "status": "completed", "created_at": "2026-09-24T15:02:11Z", "updated_at": "2026-09-24T15:04:40Z"},
                {"id": "run-0141", "status": "awaiting approval", "created_at": "2026-09-24T13:47:05Z", "updated_at": "2026-09-24T13:48:12Z"},
                {"id": "run-0140", "status": "completed", "created_at": "2026-09-23T10:20:33Z", "updated_at": "2026-09-23T10:23:01Z"},
            ])
        if path == "/api/documents":
            return self.send([{"id": d["id"], "filename": d["metadata"]["filename"], "uploaded_at": "2026-09-20T09:00:00Z"} for d in DOCS])
        if path == "/api/projects":
            return self.send({"projects": [{"id": r["full_name"], "name": r["name"], "provider": "forgejo"} for r in REPOS]})
        if path == "/context/query":
            return self.send({"results": DOCS})
        if path in ("/context/ingest", "/mcp/ingest", "/api/build/execute", "/api/projects/mirror"):
            return self.send({"status": "demo", "message": DISABLED})
        if path == "/api/rag/upload":
            return self.send({"success": False, "error": DISABLED})
        if path.startswith("/api/defcon/"):
            return self.send({"status": "demo", "message": "DEFCON ONE approvals are not live in the demo."})
        if path == "/pipeline/multi-agent":
            return self.send(MULTI_AGENT)
        if path.startswith("/pipeline/multi-agent/status/"):
            return self.send({"status": "complete", "run_id": "demo-run"})
        if path.startswith("/pipeline/multi-agent/apply/"):
            return self.send({"ok": False, "error": DISABLED})
        return self.send({"detail": "Not available in the demo"}, 404)

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.send({"detail": DISABLED}, 403)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
