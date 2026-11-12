import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ToolSession {
  id: string;
  title: string;
  created_at: string;
  last_used_at: string;
  status: 'active' | 'archived';
}

export interface SessionMapping {
  tool_session_id: string;
  provider: 'chatgpt' | 'claude' | 'grok' | 'gemini' | 'deepseek';
  provider_session_ref: string;
  created_at: string;
  last_used_at: string;
}

export interface Turn {
  id: string;
  tool_session_id: string;
  user_input: string;
  mode: 'SINGLE' | 'PARALLEL' | 'DEBATE' | 'VERIFY';
  participants: string[]; // JSON array of provider names
  final_answer: string;
  created_at: string;
  duration_ms: number;
}

export interface AgentCall {
  id: string;
  turn_id: string;
  provider: string;
  role: 'answer' | 'critique' | 'synthesis' | 'judge' | 'summarize';
  prompt_sent: string;
  response_text: string;
  token_est_in: number;
  token_est_out: number;
  status: 'success' | 'timeout' | 'selector_error' | 'login_required';
  error_msg?: string | null;
  started_at: string;
  finished_at: string;
}

export interface SummaryCache {
  content_hash: string; // SHA256 of source content
  level: 'DETAILED' | 'SUMMARY' | 'ABSTRACT';
  summary_text: string;
  created_at: string;
}

export interface ProviderConfig {
  provider: 'chatgpt' | 'claude' | 'grok' | 'gemini' | 'deepseek';
  name: string;
  chat_url: string;
  login_url: string;
  selectors: {
    input_box: string;
    send_button: string;
    stop_button: string;
    new_chat_button: string;
    last_message_container: string;
  };
  logged_in: boolean;
  updated_at: string;
  notes: string;
}

export interface DatabaseState {
  tool_session: ToolSession[];
  session_mapping: SessionMapping[];
  turn: Turn[];
  agent_call: AgentCall[];
  summary_cache: SummaryCache[];
  provider_config: ProviderConfig[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'orchestrator_db.json');

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    provider: 'chatgpt',
    name: 'ChatGPT (Brain Orchestrator)',
    chat_url: 'https://chatgpt.com',
    login_url: 'https://chatgpt.com/auth/login',
    selectors: {
      input_box: '#prompt-textarea',
      send_button: "button[data-testid='send-button']",
      stop_button: "button[aria-label='Stop streaming']",
      new_chat_button: "a[data-testid='create-new-chat-button']",
      last_message_container: "[data-message-author-role='assistant']:last-child",
    },
    logged_in: true,
    updated_at: new Date().toISOString(),
    notes: 'Orchestrator brain. URL ref: /c/<conversation_id>',
  },
  {
    provider: 'claude',
    name: 'Claude 3.7 Sonnet',
    chat_url: 'https://claude.ai',
    login_url: 'https://claude.ai/login',
    selectors: {
      input_box: "div[contenteditable='true']",
      send_button: "button[aria-label='Send Message']",
      stop_button: "button[aria-label='Stop']",
      new_chat_button: "button[aria-label='Start new chat']",
      last_message_container: '.font-user-message + .font-claude-message:last-child',
    },
    logged_in: true,
    updated_at: new Date().toISOString(),
    notes: 'Deep reasoning & analysis. URL ref: /chat/<conversation_id>',
  },
  {
    provider: 'gemini',
    name: 'Gemini 2.5 Flash / Pro',
    chat_url: 'https://gemini.google.com/app',
    login_url: 'https://accounts.google.com',
    selectors: {
      input_box: '.ql-editor',
      send_button: "button[aria-label='Send message']",
      stop_button: "button[aria-label='Stop generation']",
      new_chat_button: "button[aria-label='New chat']",
      last_message_container: '.response-container-content:last-child',
    },
    logged_in: true,
    updated_at: new Date().toISOString(),
    notes: 'Multimodal and broad general knowledge. URL ref: /app/<conversation_id>',
  },
  {
    provider: 'grok',
    name: 'Grok 3 (xAI)',
    chat_url: 'https://grok.com',
    login_url: 'https://grok.com/login',
    selectors: {
      input_box: "textarea[placeholder*='Ask Grok']",
      send_button: "button[type='submit']",
      stop_button: "button[aria-label='Stop']",
      new_chat_button: "button[aria-label='New Conversation']",
      last_message_container: '.message-bubble-assistant:last-child',
    },
    logged_in: true,
    updated_at: new Date().toISOString(),
    notes: 'Real-time perspective & counter-arguments. URL ref: /share/<ref>',
  },
  {
    provider: 'deepseek',
    name: 'DeepSeek R1 / V3',
    chat_url: 'https://chat.deepseek.com',
    login_url: 'https://chat.deepseek.com/sign_in',
    selectors: {
      input_box: '#chat-input',
      send_button: 'button.send-btn',
      stop_button: 'button.stop-btn',
      new_chat_button: 'div.new-chat-btn',
      last_message_container: '.chat-message-assistant:last-child',
    },
    logged_in: true,
    updated_at: new Date().toISOString(),
    notes: 'Used for semantic compression & math/logic. URL ref: /c/<id>',
  },
];

class Database {
  private state: DatabaseState = {
    tool_session: [],
    session_mapping: [],
    turn: [],
    agent_call: [],
    summary_cache: [],
    provider_config: DEFAULT_PROVIDERS,
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.state = {
          tool_session: parsed.tool_session || [],
          session_mapping: parsed.session_mapping || [],
          turn: parsed.turn || [],
          agent_call: parsed.agent_call || [],
          summary_cache: parsed.summary_cache || [],
          provider_config: parsed.provider_config?.length ? parsed.provider_config : DEFAULT_PROVIDERS,
        };
      } else {
        this.seedInitialSession();
        this.save();
      }
    } catch (e) {
      console.error('Error initializing database:', e);
      this.seedInitialSession();
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving database:', e);
    }
  }

  private seedInitialSession() {
    const sessionId = 'sess_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();
    const session: ToolSession = {
      id: sessionId,
      title: 'Quantum Computing vs Post-Quantum Cryptography',
      created_at: now,
      last_used_at: now,
      status: 'active',
    };
    this.state.tool_session = [session];

    // Seed session_mapping for all 5 providers
    const providers: ProviderConfig['provider'][] = ['chatgpt', 'claude', 'gemini', 'grok', 'deepseek'];
    this.state.session_mapping = providers.map((p) => ({
      tool_session_id: sessionId,
      provider: p,
      provider_session_ref: this.generateSessionRef(p),
      created_at: now,
      last_used_at: now,
    }));

    // Seed a completed turn to show rich initial data
    const turnId = 'turn_' + crypto.randomBytes(6).toString('hex');
    const turn: Turn = {
      id: turnId,
      tool_session_id: sessionId,
      user_input: 'Will Shor\'s algorithm render RSA obsolete within the next 7 years, and what post-quantum algorithms are already production-ready?',
      mode: 'DEBATE',
      participants: ['claude', 'gemini', 'grok', 'deepseek'],
      final_answer: `### Synthesized Orchestrator Consensus & Analysis (ChatGPT Brain)

**Consensus Findings:**
- **Shor's Algorithm Horizon**: Consensus among Claude, Gemini, DeepSeek, and Grok confirms that Shor's algorithm running on cryptographically relevant quantum computers (CRQC) is **unlikely to break standard 2048-bit RSA within a 7-year horizon (by 2033)**. Estimates for fault-tolerant physical qubit counts (several thousand logical qubits / millions of physical noisy qubits) remain technologically out of reach for commercial decryption in this timeframe.
- **Harvest-Now, Decrypt-Later (HNDL)**: All models unanimously highlight that the operational threat is immediate. Adversaries are actively capturing encrypted data to decrypt retroactively once CRQC is realized.
- **NIST Production-Ready Standards**: Standardized post-quantum algorithms are already production-grade:
  1. **ML-KEM (FIPS 203 / Kyber)** for key encapsulation (already deployed in Google Chrome and Cloudflare).
  2. **ML-DSA (FIPS 204 / Dilithium)** and **SLH-DSA (FIPS 205 / SPHINCS+)** for digital signatures.

**Contested Debated Points:**
- **Grok** argued that aggressive military/state lab milestones or hybrid analog-quantum annealers might achieve targeted breaks earlier than 2033 for smaller legacy keys (1024-bit).
- **Claude & DeepSeek** countered that error correction overhead (surface code surface thresholds) remains too steep, and that hybrid classic+PQC handshakes (X25519+ML-KEM) eliminate catastrophic risk during the transition.`,
      created_at: now,
      duration_ms: 4200,
    };
    this.state.turn = [turn];

    // Add agent calls
    this.state.agent_call = [
      {
        id: 'call_' + crypto.randomBytes(6).toString('hex'),
        turn_id: turnId,
        provider: 'chatgpt',
        role: 'judge',
        prompt_sent: 'Orchestrator routing decision: evaluate query complexity and controversial nature.',
        response_text: JSON.stringify({ mode: 'DEBATE', participants: ['claude', 'gemini', 'grok', 'deepseek'], reason: 'Controversial technological timeline and multi-perspective cryptography evaluation required.' }),
        token_est_in: 280,
        token_est_out: 65,
        status: 'success',
        started_at: now,
        finished_at: now,
      },
      {
        id: 'call_' + crypto.randomBytes(6).toString('hex'),
        turn_id: turnId,
        provider: 'claude',
        role: 'answer',
        prompt_sent: 'Will Shor\'s algorithm render RSA obsolete within the next 7 years...',
        response_text: 'While Shor\'s algorithm mathematically breaks RSA, physical implementation requires fault-tolerant logical qubits (~4000 logical qubits for RSA-2048). Most quantum roadmap consensus places this beyond 2035.',
        token_est_in: 320,
        token_est_out: 480,
        status: 'success',
        started_at: now,
        finished_at: now,
      },
      {
        id: 'call_' + crypto.randomBytes(6).toString('hex'),
        turn_id: turnId,
        provider: 'deepseek',
        role: 'summarize',
        prompt_sent: 'Semantic compressor: summarize Claude response to DETAILED level.',
        response_text: 'RSA-2048 requires ~4000 logical qubits; realistic horizon >2035 due to error mitigation. Threat is retroactive capture (HNDL). NIST ML-KEM ready.',
        token_est_in: 480,
        token_est_out: 85,
        status: 'success',
        started_at: now,
        finished_at: now,
      },
    ];

    // Seed summary cache
    const sampleHash = crypto.createHash('sha256').update('While Shor\'s algorithm mathematically breaks RSA...').digest('hex');
    this.state.summary_cache = [
      {
        content_hash: sampleHash,
        level: 'DETAILED',
        summary_text: 'RSA-2048 requires ~4000 logical qubits; realistic horizon >2035 due to error mitigation. Threat is retroactive capture (HNDL). NIST ML-KEM ready.',
        created_at: now,
      },
    ];
  }

  public generateSessionRef(provider: ProviderConfig['provider']): string {
    const hex = crypto.randomBytes(8).toString('hex');
    switch (provider) {
      case 'chatgpt':
        return `https://chatgpt.com/c/${hex}`;
      case 'claude':
        return `https://claude.ai/chat/${hex}`;
      case 'gemini':
        return `https://gemini.google.com/app/${hex}`;
      case 'grok':
        return `https://grok.com/share/${hex}`;
      case 'deepseek':
        return `https://chat.deepseek.com/c/${hex}`;
    }
  }

  // --- CRUD operations ---
  public getSessions(): ToolSession[] {
    return this.state.tool_session;
  }

  public getSession(id: string): ToolSession | undefined {
    return this.state.tool_session.find((s) => s.id === id);
  }

  public createSession(title?: string): ToolSession {
    const id = 'sess_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();
    const newSession: ToolSession = {
      id,
      title: title || `Research Session ${this.state.tool_session.length + 1}`,
      created_at: now,
      last_used_at: now,
      status: 'active',
    };
    this.state.tool_session.unshift(newSession);

    // Section 6.1: For every enabled provider, open a page, call create_new_session, store (tool_session_id, provider) -> ref in session_mapping
    const providers: ProviderConfig['provider'][] = ['chatgpt', 'claude', 'gemini', 'grok', 'deepseek'];
    for (const p of providers) {
      this.state.session_mapping.push({
        tool_session_id: id,
        provider: p,
        provider_session_ref: this.generateSessionRef(p),
        created_at: now,
        last_used_at: now,
      });
    }

    this.save();
    return newSession;
  }

  public archiveSession(id: string): boolean {
    const s = this.state.tool_session.find((s) => s.id === id);
    if (s) {
      s.status = 'archived';
      this.save();
      return true;
    }
    return false;
  }

  public unarchiveSession(id: string): boolean {
    const s = this.state.tool_session.find((s) => s.id === id);
    if (s) {
      s.status = 'active';
      this.save();
      return true;
    }
    return false;
  }

  public deleteSession(id: string): boolean {
    this.state.tool_session = this.state.tool_session.filter((s) => s.id !== id);
    this.state.session_mapping = this.state.session_mapping.filter((m) => m.tool_session_id !== id);
    this.state.turn = this.state.turn.filter((t) => t.tool_session_id !== id);
    this.save();
    return true;
  }

  public getMappingsForSession(toolSessionId: string): SessionMapping[] {
    return this.state.session_mapping.filter((m) => m.tool_session_id === toolSessionId);
  }

  public updateMappingRef(toolSessionId: string, provider: ProviderConfig['provider'], newRef: string) {
    const m = this.state.session_mapping.find(
      (item) => item.tool_session_id === toolSessionId && item.provider === provider
    );
    const now = new Date().toISOString();
    if (m) {
      m.provider_session_ref = newRef;
      m.last_used_at = now;
    } else {
      this.state.session_mapping.push({
        tool_session_id: toolSessionId,
        provider,
        provider_session_ref: newRef,
        created_at: now,
        last_used_at: now,
      });
    }
    this.save();
  }

  public getTurns(toolSessionId: string): Turn[] {
    return this.state.turn.filter((t) => t.tool_session_id === toolSessionId);
  }

  public getTurn(turnId: string): Turn | undefined {
    return this.state.turn.find((t) => t.id === turnId);
  }

  public addTurn(turn: Turn) {
    this.state.turn.push(turn);
    const session = this.state.tool_session.find((s) => s.id === turn.tool_session_id);
    if (session) {
      session.last_used_at = new Date().toISOString();
    }
    this.save();
  }

  public getAgentCalls(turnId: string): AgentCall[] {
    return this.state.agent_call.filter((c) => c.turn_id === turnId);
  }

  public addAgentCall(call: AgentCall) {
    this.state.agent_call.push(call);
    this.save();
  }

  public getSummary(contentHash: string, level: SummaryCache['level']): string | null {
    const found = this.state.summary_cache.find(
      (c) => c.content_hash === contentHash && c.level === level
    );
    return found ? found.summary_text : null;
  }

  public setSummary(contentHash: string, level: SummaryCache['level'], text: string) {
    this.state.summary_cache.push({
      content_hash: contentHash,
      level,
      summary_text: text,
      created_at: new Date().toISOString(),
    });
    this.save();
  }

  public getProviders(): ProviderConfig[] {
    return this.state.provider_config;
  }

  public updateProviderConfig(provider: ProviderConfig['provider'], partial: Partial<ProviderConfig>) {
    const p = this.state.provider_config.find((item) => item.provider === provider);
    if (p) {
      Object.assign(p, partial, { updated_at: new Date().toISOString() });
      this.save();
    }
  }

  public getTableData(table: string): any[] {
    switch (table) {
      case 'tool_session':
        return this.state.tool_session;
      case 'session_mapping':
        return this.state.session_mapping;
      case 'turn':
        return this.state.turn;
      case 'agent_call':
        return this.state.agent_call;
      case 'summary_cache':
        return this.state.summary_cache;
      case 'provider_config':
        return this.state.provider_config;
      default:
        return [];
    }
  }

  public generateSqlDump(): string {
    let sql = `-- Multi-Agent Web UI Orchestrator SQLite Dump\n-- Generated at: ${new Date().toISOString()}\n\n`;
    sql += `CREATE TABLE IF NOT EXISTS tool_session (\n  id TEXT PRIMARY KEY,\n  title TEXT,\n  created_at DATETIME,\n  last_used_at DATETIME,\n  status TEXT\n);\n\n`;
    sql += `CREATE TABLE IF NOT EXISTS session_mapping (\n  tool_session_id TEXT,\n  provider TEXT,\n  provider_session_ref TEXT,\n  created_at DATETIME,\n  last_used_at DATETIME,\n  PRIMARY KEY (tool_session_id, provider),\n  FOREIGN KEY (tool_session_id) REFERENCES tool_session(id)\n);\n\n`;
    sql += `CREATE TABLE IF NOT EXISTS turn (\n  id TEXT PRIMARY KEY,\n  tool_session_id TEXT,\n  user_input TEXT,\n  mode TEXT,\n  participants TEXT,\n  final_answer TEXT,\n  created_at DATETIME,\n  duration_ms INTEGER\n);\n\n`;
    sql += `CREATE TABLE IF NOT EXISTS agent_call (\n  id TEXT PRIMARY KEY,\n  turn_id TEXT,\n  provider TEXT,\n  role TEXT,\n  prompt_sent TEXT,\n  response_text TEXT,\n  token_est_in INTEGER,\n  token_est_out INTEGER,\n  status TEXT,\n  error_msg TEXT,\n  started_at DATETIME,\n  finished_at DATETIME\n);\n\n`;
    sql += `CREATE TABLE IF NOT EXISTS summary_cache (\n  content_hash TEXT PRIMARY KEY,\n  level TEXT,\n  summary_text TEXT,\n  created_at DATETIME\n);\n\n`;
    sql += `CREATE TABLE IF NOT EXISTS provider_config (\n  provider TEXT PRIMARY KEY,\n  chat_url TEXT,\n  selectors TEXT,\n  updated_at DATETIME,\n  notes TEXT\n);\n\n`;

    // Add inserts
    for (const s of this.state.tool_session) {
      sql += `INSERT INTO tool_session VALUES ('${s.id}', '${s.title.replace(/'/g, "''")}', '${s.created_at}', '${s.last_used_at}', '${s.status}');\n`;
    }
    for (const m of this.state.session_mapping) {
      sql += `INSERT INTO session_mapping VALUES ('${m.tool_session_id}', '${m.provider}', '${m.provider_session_ref}', '${m.created_at}', '${m.last_used_at}');\n`;
    }
    for (const t of this.state.turn) {
      sql += `INSERT INTO turn VALUES ('${t.id}', '${t.tool_session_id}', '${t.user_input.replace(/'/g, "''")}', '${t.mode}', '${JSON.stringify(t.participants)}', '${t.final_answer.replace(/'/g, "''")}', '${t.created_at}', ${t.duration_ms});\n`;
    }
    for (const c of this.state.agent_call) {
      sql += `INSERT INTO agent_call VALUES ('${c.id}', '${c.turn_id}', '${c.provider}', '${c.role}', '${c.prompt_sent.replace(/'/g, "''")}', '${c.response_text.replace(/'/g, "''")}', ${c.token_est_in}, ${c.token_est_out}, '${c.status}', ${c.error_msg ? `'${c.error_msg.replace(/'/g, "''")}'` : 'NULL'}, '${c.started_at}', '${c.finished_at}');\n`;
    }
    for (const sc of this.state.summary_cache) {
      sql += `INSERT INTO summary_cache VALUES ('${sc.content_hash}', '${sc.level}', '${sc.summary_text.replace(/'/g, "''")}', '${sc.created_at}');\n`;
    }
    for (const pc of this.state.provider_config) {
      sql += `INSERT INTO provider_config VALUES ('${pc.provider}', '${pc.chat_url}', '${JSON.stringify(pc.selectors).replace(/'/g, "''")}', '${pc.updated_at}', '${pc.notes.replace(/'/g, "''")}');\n`;
    }
    return sql;
  }
}

export const db = new Database();
