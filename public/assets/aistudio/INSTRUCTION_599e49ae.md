# Project Instruction: Multi-Agent Web UI Orchestrator

## 1. Project Overview
Build a **multi-agent orchestration tool** that lets a user paste a question into a local web UI and receive a synthesized answer from multiple AI models (ChatGPT, Claude, Grok, Gemini, DeepSeek).

**Key constraints (non-negotiable)**:

- **NO API usage**. All model interactions go through browser automation (Playwright) driving each provider's web UI.

- **ChatGPT acts as the orchestrator ("brain")**. It receives the user question, decides routing (single / parallel / debate / verify), and produces the final synthesized answer.

- **Context is preserved per session**. A tool session maps 1:1 to a conversation on every agent. A new tool session creates new conversations on all agents. Within a session, all turns continue the same provider conversations.

- **Semantic compression on cross-agent transfer**. Never forward full text between agents; forward summary-level versions to save tokens.

<br>

## 2. Tech Stack
| Layer | Choice
|----------|----------
| Browser automation | Playwright (Python, async)
| Web UI | FastAPI + Jinja2 templates (or simple React if preferred)
| Persistence |	SQLite via SQLAlchemy (async)
| Config | YAML for provider selectors, DB for runtime overrides
| Language | Python 3.11+

Use `playwright.chromium` with `launch_persistent_context` for login persistence.

<br>

## 3. Repository Layout
```yaml
app/
├── main.py                      # FastAPI entrypoint
├── config.py                    # Settings loader
├── db/
│   ├── models.py                # SQLAlchemy models
│   ├── session.py               # Async engine + session factory
│   └── migrations/
├── providers/
│   ├── base.py                  # WebProvider abstract base
│   ├── chatgpt.py
│   ├── claude.py
│   ├── grok.py
│   ├── gemini.py
│   ├── deepseek.py
│   └── registry.py              # Provider registry + factory
├── orchestrator/
│   ├── brain.py                 # ChatGPT-as-orchestrator logic
│   ├── router.py                # Mode decision (SINGLE/PARALLEL/DEBATE/VERIFY)
│   ├── debate.py                # Multi-round debate pipeline
│   └── synthesis.py             # Parallel synthesis
├── compression/
│   ├── summarizer.py            # Semantic compression
│   └── levels.py                # FULL/DETAILED/SUMMARY/ABSTRACT
├── sessions/
│   ├── manager.py               # Tool session lifecycle + mapping
│   └── browser_pool.py          # Playwright context manager
├── api/
│   ├── routes.py                # POST /sessions, POST /sessions/{id}/ask, etc.
│   └── schemas.py               # Pydantic models
├── templates/                   # Jinja2 UI
├── static/
└── tests/
```

<br>

## 4. Data Model (SQLite)
Create these tables. Use `TEXT UUIDs` as primary keys.

### 4.1 `tool_session`
```sql
id TEXT PRIMARY KEY,
title TEXT,
created_at DATETIME,
last_used_at DATETIME,
status TEXT  -- 'active' | 'archived'
```

### 4.2 `session_mapping` (critical)
```sql
tool_session_id TEXT,
provider TEXT,               -- 'chatgpt' | 'claude' | ...
provider_session_ref TEXT,   -- URL or ID of the conversation on that provider
created_at DATETIME,
last_used_at DATETIME,
PRIMARY KEY (tool_session_id, provider),
FOREIGN KEY (tool_session_id) REFERENCES tool_session(id)
```

### 4.3 `turn`
```sql
id TEXT PRIMARY KEY,
tool_session_id TEXT,
user_input TEXT,
mode TEXT,                   -- 'SINGLE' | 'PARALLEL' | 'DEBATE' | 'VERIFY'
participants TEXT,           -- JSON array
final_answer TEXT,
created_at DATETIME,
duration_ms INTEGER
```

### 4.4 `agent_call`
```sql
id TEXT PRIMARY KEY,
turn_id TEXT,
provider TEXT,
role TEXT,                   -- 'answer' | 'critique' | 'synthesis' | 'judge' | 'summarize'
prompt_sent TEXT,
response_text TEXT,
token_est_in INTEGER,
token_est_out INTEGER,
status TEXT,                 -- 'success' | 'timeout' | 'selector_error' | 'login_required'
error_msg TEXT,
started_at DATETIME,
finished_at DATETIME
```

### 4.5 `summary_cache`
```sql
content_hash TEXT PRIMARY KEY,   -- SHA256 of source content
level TEXT,                      -- 'DETAILED' | 'SUMMARY' | 'ABSTRACT'
summary_text TEXT,
created_at DATETIME
```

### 4.6 `provider_config`
```sql
provider TEXT PRIMARY KEY,
chat_url TEXT,
selectors TEXT,                  -- JSON
updated_at DATETIME,
notes TEXT
```
**Do NOT store:** cookies, credentials, full conversation history, raw streaming chunks, vector embeddings.

<br>

## 5. Provider Adapter Contract

### 5.1 Abstract base (providers/base.py)
```python
class WebProvider(ABC):
    name: str
    login_url: str
    chat_url: str

    @abstractmethod
    async def is_logged_in(self, page: Page) -> bool: ...

    @abstractmethod
    async def create_new_session(self, page: Page) -> str:
        """Start a new conversation; return a stable session_ref (URL or ID)."""

    @abstractmethod
    async def resume_session(self, page: Page, ref: str) -> None:
        """Navigate to an existing conversation by ref."""

    @abstractmethod
    async def submit_prompt(self, page: Page, text: str) -> None:
        """Paste text into input and trigger send."""

    @abstractmethod
    async def wait_for_response(self, page: Page, timeout_s: int = 180) -> str:
        """Wait until streaming completes; return extracted text."""

    @abstractmethod
    async def get_current_session_ref(self, page: Page) -> str:
        """Return the current conversation ref after sending."""
```

### 5.2 Implementation notes per provider
- **ChatGPT**: `chat_url = https://chatgpt.com`. New chat via "New chat" button. Session ref = URL `/c/<id>`.

- **Claude**: `chat_url = https://claude.ai`. Session ref = URL `/chat/<id>`.

- **Gemini**: `chat_url = https://gemini.google.com/app`. Session ref = URL path segment.

- **Grok**: `chat_url = https://grok.com` (or x.com/i/grok). Session ref = conversation URL.

- **DeepSeek**: `chat_url = https://chat.deepseek.com.` Session ref = conversation URL or title.

### 5.3 Streaming detection strategy
For each provider, implement `wait_for_response` as:

1. Record a hash of the last message's DOM text.

2. Poll every 500ms.

3. Consider complete when: (a) the "stop generating" button is absent AND (b) text hash has been stable for 2 consecutive seconds.

4. Hard timeout: 180s → `mark status='timeout'`.

### 5.4 Selector configuration
All selectors must come from `provider_config.selectors` (JSON), with keys:
```json
{
  "input_box": "...",
  "send_button": "...",
  "stop_button": "...",
  "new_chat_button": "...",
  "last_message_container": "..."
}
```
Fallback defaults in YAML. Never hardcode selectors in Python.

### 5.5 Login handling
- Use `launch_persistent_context(user_data_dir=".browser_profiles/<provider>")`.

- If `is_logged_in()` returns false → raise `LoginRequiredError`. The web UI must show a "Login to <provider>" button that opens a headed browser window for manual login.

- Never attempt automated login with credentials.

<br>

## 6. Session Management
### 6.1 Create a tool session

`POST /sessions`

1. Insert `tool_session` row.

2. For every enabled provider, open a page, call `create_new_session`, store `(tool_session_id, provider) → ref` in `session_mapping`.

3. Return `tool_session_id`.

### 6.2 Ask within a session
`POST /sessions/{id}/ask`

1. Load all mappings for this session.

2. Orchestrator decides mode (see §7).

3. For each provider needed: `resume_session(page, ref)` → `submit_prompt` → `wait_for_response`.

4. After each call, refresh `get_current_session_ref` (in case URL changed) and update mapping.

5. Update `last_used_at`.

### 6.3 New session in future
Only created explicitly by the user via `POST /sessions`. Never create a new agent conversation implicitly — this would break context continuity.

### 6.4 Browser resource management
- One `BrowserContext` per provider (persistent).

- One `Page` per `(tool_session_id, provider)`. Keep an in-memory pool.

- Evict idle pages after N minutes; on next use, `resume_session` restores state.

## 7. Orchestrator Logic (ChatGPT as Brain)

### 7.1 Routing prompt (sent to ChatGPT)
```
You are an orchestrator. Given the user question, choose ONE mode:
- SINGLE: one model suffices
- PARALLEL: query 2-3 models in parallel, then synthesize
- DEBATE: multi-model debate (controversial / multi-perspective questions)
- VERIFY: one model answers, others verify

Respond in strict JSON:
{"mode": "...", "participants": ["claude","gemini",...], "reason": "..."}
```
Parse JSON from ChatGPT's response. On parse failure, default to `PARALLEL` with `["claude","gemini"]`.

### 7.2 DEBATE pipeline
#### Round 1 — Independent answers

- Each participant receives the original question.

- Store each response.

#### Round 2 — Cross-critique

- Compress each response to `DETAILED` level.

- Each participant receives the DETAILED versions of the other participants' answers.

- Prompt: critique in 200 words max — strengths, weaknesses, and whether own view changes.

### Round 3 — Judge (ChatGPT)

- Compress all critiques to `SUMMARY`.

- Prompt ChatGPT: "Synthesize final answer, note consensus vs contested points."

### 7.3 PARALLEL pipeline
- Query all participants with the original question.

- Compress each to `DETAILED`.

- Send all DETAILED versions to ChatGPT with a synthesis prompt: merge into one answer, mark which points are multi-model confirmed vs contested.

### 7.4 VERIFY pipeline
- Primary model answers.

- Verifier models receive the compressed answer + original question.

- ChatGPT judges: accept / correct / flag uncertainties.

### 7.5 SINGLE pipeline
- Route directly to the single best model. Compress only if the next turn will involve other agents.

<br>

## 8. Semantic Compression
### 8.1 Levels

| Level | Retention | Use case |
|----------|----------|----------|
| FULL  | 100%  | Direct answer, no compression  |
| DETAILED  | ~50%  | Cross-agent transfer within a turn  |
| SUMMARY  | ~80%  | Debate round inputs  |
| ABSTRACT  | ~95%  | Orchestrator decisions |

### 8.2 Summarizer prompt
```
You are a semantic compressor. Compress the following into a shorter version that preserves:
1. Core conclusion (1-2 sentences)
2. Concrete facts, numbers, names mentioned (keep exact values)
3. Points of disagreement with opposing views (if any)
Remove: filler, restatement, hedging, politeness.
Source: {content}
Output only the compressed text.
```

### 8.3 Which model to run summarization
Use DeepSeek (cheapest/fastest) via its provider adapter. Cache by `sha256(content) + level` in `summary_cache`.

### 8.4 Within-session optimization
Because each agent retains full context of its own conversation, **do not** re-send full history on every turn. Only transfer:

- The new user message (for round 1)

- Compressed peer answers (for critiques)

- Compressed critiques (for judge)

<br>

## 9. API Surface
```
POST   /sessions                        -> { session_id, title }
GET    /sessions                        -> [{ id, title, last_used_at, status }]
DELETE /sessions/{id}                   -> archive (do not delete provider convs)

POST   /sessions/{id}/ask               -> { turn_id, mode, participants }
GET    /sessions/{id}/turns             -> history

GET    /turns/{turn_id}/stream          -> SSE stream of progress + final answer

POST   /providers/{name}/login          -> opens headed browser for manual login
GET    /providers                       -> [{ name, logged_in, last_used_at }]
```

Web UI requirements:

- Session sidebar (create / switch / archive)

- Question input box

- Live progress panel: which agents are active, current phase, debate rounds visible

- Final answer area with "consensus vs contested" annotation

- Provider status indicator (login required if any adapter reports false)

<br>

## 10. Error Handling & Resilience

| Error | Behavior |
|----------|----------|
| `LoginRequiredError`  | Mark turn failed, surface login button, do not retry |
| `SelectorError`  | Log to `agent_call.error_msg`, try fallback selector from config, else fail gracefully | 
| `TimeoutError`  | Return partial text if streaming had started, else mark timeout |
| Rate limit suspicion (429-equivalent UI)  | Back off exponentially, retry up to 2 times |
| JSON parse failure from orchestrator  | Default to PARALLEL with sensible participants |

Every `agent_call` row must be recorded, even on failure — this is the primary debugging surface.

<br>

## 11. Rate Limiting / Politeness
- Add 1-3s randomized delay between calls to the same provider.

- Never run more than 2 concurrent calls against the same provider.

- Respect `Retry-After-style` UI messages if any are visible.

<br>

## 12. Implementation Phases (Build Order)
### Phase 1 — Skeleton
- □ FastAPI app + SQLite schema + basic session CRUD
- □ `WebProvider` abstract + `ChatGPTProvider` with login check
- □ `provider_config` seeded with default selectors
- □ Minimal web UI: create session, send a message, see ChatGPT response

### Phase 2 — Multi-provider
- □ Add Claude, Gemini, DeepSeek, Grok adapters
- □ Manual login flow for each
- □ `session_mapping` populated on session creation
- □ Session resume works: ask again → same conversation continues on all providers

### Phase 3 — Orchestration
- □ `Router` calls ChatGPT to choose mode + participants
- □ PARALLEL pipeline
- □ DEBATE pipeline (3 rounds)
- □ VERIFY pipeline
- □ Record all `agent_call` rows

### Phase 4 — Compression
- □ Summarizer using DeepSeek provider adapter
- □ `summary_cache` with content-hash keying
- □ Wire compression into debate/critique/judge stages

### Phase 5 — UX polish
- □ SSE streaming of progress
- □ Debate transcript viewer
- □ Provider login status badges
- □ Session archive/restore

### Phase 6 — Hardening
- □ Retry/backoff
- □ Selector fallback
- □ Timeout handling
- □ Logs and token accounting

<br>

## 13. Anti-patterns to Avoid
- ❌ Calling provider APIs directly. Even for summarization. Use the browser adapters.

- ❌ Recreating provider conversations on every ask. This destroys context and defeats the session mapping design.

- ❌ Passing full conversation history between agents each turn. Each agent already has its own history; only pass new/compressed content.

- ❌ Hardcoding CSS selectors in Python files. Use `provider_config`.

- ❌ Storing cookies in the DB. Let Playwright's persistent profile handle it.

- ❌ Fire-and-forget agent calls. Always persist an `agent_call` row with status.

- ❌ Blocking the HTTP request for the entire orchestration. Use SSE or background task + polling.

<br>

## 14. Acceptance Criteria
1. The build is complete when a user can:

2. Start the app, create a session, and log in to all 5 providers once.

3. Ask a question — ChatGPT routes it, and the system returns a final answer with debate transcript visible.

4. Ask a follow-up question in the same session — every agent continues its previous conversation (verified by checking each agent's web UI shows both turns).

5. Create a new session — every agent starts a fresh conversation.

6. Inspect the DB and see: `tool_session`, `session_mapping` (5 rows per session), `turn`, multiple `agent_call` rows per turn, and `summary_cache` populated after a DEBATE turn.

7. Kill and restart the app — sessions and mappings survive; asking in an old session resumes correctly.

<br>

## 15. Legal / Safety Note
Add to README:
>This tool automates third-party web interfaces. Users must comply with each provider's Terms of Service. It is intended for personal research and educational use. Do not use it for high-volume scraping or to circumvent paid plans.

<br>

## 16. Out of Scope (for v1)
- Multi-user auth

- Cloud deployment / horizontal scaling

- Vector search across history

- Mobile UI

- Automated provider login

- Multi-language UI (English UI only in v1)