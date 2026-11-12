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
  participants: string[];
  final_answer: string;
  created_at: string;
  duration_ms: number;
  agent_calls?: AgentCall[];
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
  content_hash: string;
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

export interface ProgressEvent {
  type: 'phase' | 'agent_start' | 'agent_chunk' | 'agent_done' | 'compression' | 'final_answer' | 'error' | 'done' | 'connected';
  phase?: string;
  provider?: string;
  role?: string;
  content?: string;
  turn_id?: string;
  metadata?: any;
}
