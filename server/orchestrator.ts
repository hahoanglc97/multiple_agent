import crypto from 'crypto';
import { db, AgentCall, Turn, ProviderConfig } from './db';

export type OrchestratorMode = 'SINGLE' | 'PARALLEL' | 'DEBATE' | 'VERIFY';

export interface ProgressEvent {
  type: 'phase' | 'agent_start' | 'agent_chunk' | 'agent_done' | 'compression' | 'final_answer' | 'error' | 'done';
  phase?: string;
  provider?: string;
  role?: string;
  content?: string;
  turn_id?: string;
  metadata?: any;
}

export type ProgressCallback = (event: ProgressEvent) => void;

// Helper: SHA256
export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Estimate tokens (roughly 4 characters per token)
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class OrchestratorService {
  /**
   * Section 7.1: ChatGPT Brain decides the routing mode and participants.
   */
  public async routeQuestion(
    question: string,
    forcedMode?: OrchestratorMode,
    forcedParticipants?: string[]
  ): Promise<{ mode: OrchestratorMode; participants: string[]; reason: string }> {
    if (forcedMode) {
      const defaultParticipants: Record<OrchestratorMode, string[]> = {
        SINGLE: ['claude'],
        PARALLEL: ['claude', 'gemini'],
        DEBATE: ['claude', 'gemini', 'grok'],
        VERIFY: ['claude', 'gemini', 'deepseek'],
      };
      return {
        mode: forcedMode,
        participants: forcedParticipants && forcedParticipants.length > 0 ? forcedParticipants : defaultParticipants[forcedMode],
        reason: `Manually directed mode override to ${forcedMode}.`,
      };
    }

    const qLower = question.toLowerCase();

    // Check login state of orchestrator
    const chatgptConfig = db.getProviders().find((p) => p.provider === 'chatgpt');
    if (!chatgptConfig?.logged_in) {
      throw new Error('LoginRequiredError: ChatGPT (Brain Orchestrator) is not logged in.');
    }

    // Heuristics simulating ChatGPT Orchestrator Brain Decision
    if (
      qLower.includes('debate') ||
      qLower.includes('vs') ||
      qLower.includes('versus') ||
      qLower.includes('better') ||
      qLower.includes('controversial') ||
      qLower.includes('ethics') ||
      qLower.includes('philosophy') ||
      qLower.includes('opinion') ||
      qLower.includes('pros and cons') ||
      qLower.includes('trade-off')
    ) {
      return {
        mode: 'DEBATE',
        participants: ['claude', 'gemini', 'grok', 'deepseek'],
        reason: 'Question presents competing paradigms or qualitative trade-offs requiring adversarial cross-critique and multi-angle debate.',
      };
    } else if (
      qLower.includes('verify') ||
      qLower.includes('fact check') ||
      qLower.includes('accuracy') ||
      qLower.includes('is it true') ||
      qLower.includes('claim') ||
      qLower.includes('proof') ||
      qLower.includes('citation')
    ) {
      return {
        mode: 'VERIFY',
        participants: ['claude', 'gemini', 'deepseek'],
        reason: 'Empirical or verifiable factual inquiry. Requires high-rigor primary formulation followed by independent multi-model verification.',
      };
    } else if (
      qLower.includes('compare') ||
      qLower.includes('explain') ||
      qLower.includes('architecture') ||
      qLower.includes('how to') ||
      qLower.includes('best practices') ||
      qLower.includes('overview')
    ) {
      return {
        mode: 'PARALLEL',
        participants: ['claude', 'gemini'],
        reason: 'Broad exploratory prompt. Synthesizing complementary strengths across multiple leading frontiers provides high coverage.',
      };
    } else {
      return {
        mode: 'SINGLE',
        participants: ['claude'],
        reason: 'Focused, deterministic inquiry. Single high-capability model is optimal to minimize latency and token expenditure.',
      };
    }
  }

  /**
   * Section 8: Semantic Compression via DeepSeek
   */
  public async compressText(
    content: string,
    level: 'DETAILED' | 'SUMMARY' | 'ABSTRACT',
    turnId: string,
    onProgress?: ProgressCallback
  ): Promise<{ compressed: string; cached: boolean; tokensSaved: number }> {
    const hash = sha256(content);
    const cached = db.getSummary(hash, level);
    const originalTokens = estimateTokens(content);

    if (cached) {
      onProgress?.({
        type: 'compression',
        phase: `Summary Cache Hit [${level}]`,
        metadata: { level, hash: hash.slice(0, 10), cached: true },
      });
      return {
        compressed: cached,
        cached: true,
        tokensSaved: Math.max(0, originalTokens - estimateTokens(cached)),
      };
    }

    onProgress?.({
      type: 'compression',
      phase: `Running DeepSeek Semantic Compressor [${level}]...`,
      metadata: { level, hash: hash.slice(0, 10), cached: false },
    });

    const startTime = new Date().toISOString();
    await sleep(400);

    // Realistic compression logic
    let compressedText = '';
    const sentences = content
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (level === 'DETAILED') {
      // ~50% retention: retain core sentences, facts, numbers
      const retained = sentences.filter((_, idx) => idx % 2 === 0 || idx === 0);
      compressedText = retained.join(' ');
      if (compressedText.length < 20) compressedText = content.slice(0, Math.floor(content.length * 0.55));
    } else if (level === 'SUMMARY') {
      // ~80% compression (20% retention): 1-2 sentence core conclusion + facts
      compressedText = sentences.slice(0, 2).join(' ');
      if (!compressedText) compressedText = content.slice(0, 180);
    } else {
      // ABSTRACT (~95% compression): 1 sentence thesis
      compressedText = sentences[0] || content.slice(0, 100);
    }

    const endTime = new Date().toISOString();
    const tokenIn = originalTokens;
    const tokenOut = estimateTokens(compressedText);

    // Record agent call for compression
    db.addAgentCall({
      id: 'call_' + crypto.randomBytes(6).toString('hex'),
      turn_id: turnId,
      provider: 'deepseek',
      role: 'summarize',
      prompt_sent: `[Compress to ${level}]: ${content.slice(0, 120)}...`,
      response_text: compressedText,
      token_est_in: tokenIn,
      token_est_out: tokenOut,
      status: 'success',
      started_at: startTime,
      finished_at: endTime,
    });

    // Save in cache
    db.setSummary(hash, level, compressedText);

    return {
      compressed: compressedText,
      cached: false,
      tokensSaved: Math.max(0, tokenIn - tokenOut),
    };
  }

  /**
   * Execute an agent turn via simulated browser automation Playwright driver
   */
  public async executeAgentCall(
    turnId: string,
    toolSessionId: string,
    provider: ProviderConfig['provider'],
    role: AgentCall['role'],
    prompt: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const providerConfig = db.getProviders().find((p) => p.provider === provider);
    const mapping = db.getMappingsForSession(toolSessionId).find((m) => m.provider === provider);
    const sessionRef = mapping ? mapping.provider_session_ref : db.generateSessionRef(provider);

    onProgress?.({
      type: 'agent_start',
      provider,
      role,
      phase: `Dispatching to ${provider.toUpperCase()} (${role}) on ref ${sessionRef.split('/').pop()}`,
    });

    const startedAt = new Date().toISOString();

    // Check login state
    if (!providerConfig?.logged_in) {
      const errorMsg = `LoginRequiredError: Session expired or not authenticated for ${provider.toUpperCase()}. Manual login required.`;
      db.addAgentCall({
        id: 'call_' + crypto.randomBytes(6).toString('hex'),
        turn_id: turnId,
        provider,
        role,
        prompt_sent: prompt,
        response_text: '',
        token_est_in: estimateTokens(prompt),
        token_est_out: 0,
        status: 'login_required',
        error_msg: errorMsg,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });
      throw new Error(errorMsg);
    }

    // Simulate browser automation delay (1-2.5s) with streaming chunks
    const duration = 1200 + Math.random() * 1000;
    const steps = 4;
    const chunkInterval = duration / steps;

    // Generate domain-appropriate realistic content based on provider and prompt
    const responseText = this.generateModelResponse(provider, role, prompt);

    for (let i = 1; i <= steps; i++) {
      await sleep(chunkInterval);
      const partial = responseText.slice(0, Math.floor((responseText.length * i) / steps));
      onProgress?.({
        type: 'agent_chunk',
        provider,
        role,
        content: partial,
      });
    }

    const finishedAt = new Date().toISOString();
    const tokenIn = estimateTokens(prompt);
    const tokenOut = estimateTokens(responseText);

    // Save agent call to DB (§4.4)
    db.addAgentCall({
      id: 'call_' + crypto.randomBytes(6).toString('hex'),
      turn_id: turnId,
      provider,
      role,
      prompt_sent: prompt,
      response_text: responseText,
      token_est_in: tokenIn,
      token_est_out: tokenOut,
      status: 'success',
      started_at: startedAt,
      finished_at: finishedAt,
    });

    onProgress?.({
      type: 'agent_done',
      provider,
      role,
      content: responseText,
      metadata: { tokenIn, tokenOut, sessionRef },
    });

    return responseText;
  }

  /**
   * Main Ask pipeline: processes a question within a session
   */
  public async askSession(
    toolSessionId: string,
    userInput: string,
    modeOverride?: OrchestratorMode,
    participantsOverride?: string[],
    onProgress?: ProgressCallback
  ): Promise<Turn> {
    const startTime = Date.now();
    const turnId = 'turn_' + crypto.randomBytes(6).toString('hex');

    onProgress?.({
      type: 'phase',
      phase: 'Routing: ChatGPT Brain Orchestrator analyzing question...',
      turn_id: turnId,
    });

    // 1. ChatGPT decides mode & participants
    const routing = await this.routeQuestion(userInput, modeOverride, participantsOverride);

    // Record orchestrator brain call
    db.addAgentCall({
      id: 'call_' + crypto.randomBytes(6).toString('hex'),
      turn_id: turnId,
      provider: 'chatgpt',
      role: 'judge',
      prompt_sent: `Routing prompt: evaluate query "${userInput.slice(0, 100)}..."`,
      response_text: JSON.stringify(routing),
      token_est_in: estimateTokens(userInput) + 120,
      token_est_out: 45,
      status: 'success',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });

    onProgress?.({
      type: 'phase',
      phase: `Brain Decision: Mode [${routing.mode}] with participants [${routing.participants.join(', ')}]. Reason: ${routing.reason}`,
      metadata: routing,
    });

    let finalAnswer = '';

    // 2. Execute pipeline based on mode
    if (routing.mode === 'DEBATE') {
      finalAnswer = await this.runDebatePipeline(turnId, toolSessionId, userInput, routing.participants, onProgress);
    } else if (routing.mode === 'PARALLEL') {
      finalAnswer = await this.runParallelPipeline(turnId, toolSessionId, userInput, routing.participants, onProgress);
    } else if (routing.mode === 'VERIFY') {
      finalAnswer = await this.runVerifyPipeline(turnId, toolSessionId, userInput, routing.participants, onProgress);
    } else {
      finalAnswer = await this.runSinglePipeline(turnId, toolSessionId, userInput, routing.participants[0] || 'claude', onProgress);
    }

    const duration = Date.now() - startTime;
    const turn: Turn = {
      id: turnId,
      tool_session_id: toolSessionId,
      user_input: userInput,
      mode: routing.mode,
      participants: routing.participants,
      final_answer: finalAnswer,
      created_at: new Date().toISOString(),
      duration_ms: duration,
    };

    db.addTurn(turn);

    onProgress?.({
      type: 'final_answer',
      content: finalAnswer,
      turn_id: turnId,
      metadata: { duration_ms: duration, mode: routing.mode },
    });

    onProgress?.({
      type: 'done',
      turn_id: turnId,
    });

    return turn;
  }

  // --- Pipelines (§7.2, §7.3, §7.4, §7.5) ---

  private async runDebatePipeline(
    turnId: string,
    toolSessionId: string,
    userInput: string,
    participants: string[],
    onProgress?: ProgressCallback
  ): Promise<string> {
    // Round 1 — Independent answers
    onProgress?.({ type: 'phase', phase: 'Round 1: Collecting independent answers from all participants in parallel...' });
    const round1Promises = participants.map((p) =>
      this.executeAgentCall(turnId, toolSessionId, p as any, 'answer', userInput, onProgress)
    );
    const round1Answers = await Promise.all(round1Promises);

    // Round 2 — Cross-critique with semantic compression (§8)
    onProgress?.({ type: 'phase', phase: 'Round 2: Compressing Round 1 answers (DETAILED ~50%) for cross-critique...' });
    const compressedAnswers: { provider: string; compressed: string }[] = [];
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const ans = round1Answers[i];
      const comp = await this.compressText(ans, 'DETAILED', turnId, onProgress);
      compressedAnswers.push({ provider: p, compressed: comp.compressed });
    }

    onProgress?.({ type: 'phase', phase: 'Round 2: Cross-critique exchange between debate participants...' });
    const critiques: { provider: string; critique: string }[] = [];
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const peerSummaries = compressedAnswers
        .filter((item) => item.provider !== p)
        .map((item) => `[${item.provider.toUpperCase()} perspective]: ${item.compressed}`)
        .join('\n\n');

      const critiquePrompt = `Original prompt: "${userInput}"\n\nPeer arguments:\n${peerSummaries}\n\nTask: Critique in 200 words max — assess their strengths, weaknesses, and whether your own view shifts.`;
      const crit = await this.executeAgentCall(turnId, toolSessionId, p as any, 'critique', critiquePrompt, onProgress);
      critiques.push({ provider: p, critique: crit });
    }

    // Round 3 — Judge (ChatGPT Brain)
    onProgress?.({ type: 'phase', phase: 'Round 3: Compressing critiques (SUMMARY ~80%) and sending to ChatGPT Judge...' });
    const summaryCritiques: string[] = [];
    for (const c of critiques) {
      const comp = await this.compressText(c.critique, 'SUMMARY', turnId, onProgress);
      summaryCritiques.push(`[${c.provider.toUpperCase()} Critique]: ${comp.compressed}`);
    }

    const judgePrompt = `Original Question: "${userInput}"\n\nRound 2 Peer Critiques:\n${summaryCritiques.join('\n\n')}\n\nTask: Synthesize final answer, explicitly annotating consensus points vs contested/debated points.`;
    const finalSynthesis = await this.executeAgentCall(turnId, toolSessionId, 'chatgpt', 'judge', judgePrompt, onProgress);

    return finalSynthesis;
  }

  private async runParallelPipeline(
    turnId: string,
    toolSessionId: string,
    userInput: string,
    participants: string[],
    onProgress?: ProgressCallback
  ): Promise<string> {
    onProgress?.({ type: 'phase', phase: 'Parallel Pipeline: Querying participants simultaneously...' });
    const promises = participants.map((p) =>
      this.executeAgentCall(turnId, toolSessionId, p as any, 'answer', userInput, onProgress)
    );
    const answers = await Promise.all(promises);

    onProgress?.({ type: 'phase', phase: 'Semantic Compression: Compressing model outputs to DETAILED...' });
    const compressedList: string[] = [];
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const ans = answers[i];
      const comp = await this.compressText(ans, 'DETAILED', turnId, onProgress);
      compressedList.push(`[${p.toUpperCase()} findings]: ${comp.compressed}`);
    }

    onProgress?.({ type: 'phase', phase: 'ChatGPT Synthesis: Merging into unified answer with verified vs contested points...' });
    const synthesisPrompt = `Original Question: "${userInput}"\n\nParticipant findings:\n${compressedList.join('\n\n')}\n\nTask: Merge into one definitive synthesis. Mark which points are multi-model confirmed vs unique/contested.`;
    const synthesis = await this.executeAgentCall(turnId, toolSessionId, 'chatgpt', 'synthesis', synthesisPrompt, onProgress);

    return synthesis;
  }

  private async runVerifyPipeline(
    turnId: string,
    toolSessionId: string,
    userInput: string,
    participants: string[],
    onProgress?: ProgressCallback
  ): Promise<string> {
    const primary = participants[0] || 'claude';
    const verifiers = participants.slice(1);

    onProgress?.({ type: 'phase', phase: `Verify Pipeline: Primary model (${primary.toUpperCase()}) generating initial formulation...` });
    const primaryAnswer = await this.executeAgentCall(turnId, toolSessionId, primary as any, 'answer', userInput, onProgress);

    onProgress?.({ type: 'phase', phase: 'Semantic Compression: Compressing primary response for verifiers...' });
    const comp = await this.compressText(primaryAnswer, 'DETAILED', turnId, onProgress);

    onProgress?.({ type: 'phase', phase: `Independent Verification: Checking against verifiers [${verifiers.join(', ')}]...` });
    const verifierFeedback: string[] = [];
    for (const v of verifiers) {
      const verifyPrompt = `Question: "${userInput}"\n\nPrimary Claim by ${primary.toUpperCase()}:\n${comp.compressed}\n\nTask: Verify claims for accuracy, factuality, and edge cases. Flag any discrepancies or omissions.`;
      const feedback = await this.executeAgentCall(turnId, toolSessionId, v as any, 'critique', verifyPrompt, onProgress);
      verifierFeedback.push(`[${v.toUpperCase()} Verification]: ${feedback}`);
    }

    onProgress?.({ type: 'phase', phase: 'ChatGPT Judge: Evaluating primary answer against verifier feedback...' });
    const judgePrompt = `Question: "${userInput}"\n\nPrimary Answer (${primary.toUpperCase()}):\n${primaryAnswer}\n\nVerifier Reviews:\n${verifierFeedback.join('\n\n')}\n\nTask: Accept, correct, and flag any remaining uncertainties.`;
    const finalJudged = await this.executeAgentCall(turnId, toolSessionId, 'chatgpt', 'judge', judgePrompt, onProgress);

    return finalJudged;
  }

  private async runSinglePipeline(
    turnId: string,
    toolSessionId: string,
    userInput: string,
    primary: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    onProgress?.({ type: 'phase', phase: `Single Pipeline: Routing directly to ${primary.toUpperCase()}...` });
    return this.executeAgentCall(turnId, toolSessionId, primary as any, 'answer', userInput, onProgress);
  }

  /**
   * Helper generating realistic model outputs tailored to role and question
   */
  private generateModelResponse(provider: string, role: string, prompt: string): string {
    const cleanPrompt = prompt.replace(/\n/g, ' ').slice(0, 80);

    if (role === 'answer') {
      switch (provider) {
        case 'claude':
          return `From an architectural and analytical perspective on "${cleanPrompt}":
1. **Core Mechanism**: Systematic decomposition shows strong structural guarantees when isolating state mutations.
2. **Trade-offs**: Latency vs consistency bounds must be observed. Asynchronous boundaries prevent cascading blocking states.
3. **Recommendation**: Implement bounded buffers with exponential jitter backoff for high-throughput resilience.`;
        case 'gemini':
          return `Comprehensive evaluation of "${cleanPrompt}":
- **Industry Landscape**: Cross-referencing current implementations demonstrates widespread adoption of hybrid protocols.
- **Multimodal & Real-time Factors**: Data ingestion pipelines benefit from speculative pre-fetching and token compression.
- **Key Metric**: Benchmarks show approximately 35-48% efficiency gains when avoiding full-payload serialization across agent handoffs.`;
        case 'grok':
          return `Direct and pragmatic assessment:
- Most textbooks over-complicate this. In live production environments, edge-case failure modes almost always stem from stale state or network timeouts.
- **Pragmatic Counter-Point**: Don't build heavy multi-round abstractions if a single verified call suffices. When debating, adversarial friction exposes hidden assumptions.`;
        case 'deepseek':
          return `Rigorous algorithmic analysis:
- Let $C$ be the context window and $T$ be token consumption per turn. Unconstrained transfer exhibits $O(N^2)$ cross-agent token expansion.
- By enforcing semantic compression (preserving invariants: conclusions, concrete constants, disagreements), token complexity contracts to $O(N)$.
- Verified: No mathematical degradation in downstream accuracy when compression preserves key named entities.`;
        default:
          return `Balanced evaluation addressing: "${cleanPrompt}". Primary factors include protocol stability, deterministic routing, and resource bounds.`;
      }
    } else if (role === 'critique') {
      return `[Critique by ${provider.toUpperCase()}]:
- **Strengths**: Peer argument correctly identifies the core latency trade-off and highlights the need for bounded memory.
- **Weaknesses**: Underestimates edge-case failure modes under burst conditions; fails to account for state drift across asynchronous browser sessions.
- **Position Adjustment**: Maintaining initial thesis with an added stipulation that fallback selectors must execute immediately upon DOM mutation timeout.`;
    } else if (role === 'judge' || role === 'synthesis') {
      return `### Synthesized Orchestrator Consensus & Analysis (ChatGPT Brain)

**Consensus Points (Multi-Model Confirmed):**
- **State Preservation**: All models agree that maintaining a 1:1 persistent session mapping across providers is essential to prevent context thrashing.
- **Semantic Compression**: Claude, Gemini, and DeepSeek confirm that compressing intermediate transfers to ~50% (DETAILED) and ~80% (SUMMARY) prevents exponential token exhaustion without degrading synthesis fidelity.
- **Resilience**: Unanimous confirmation that browser automation requires aggressive fallback selectors and non-blocking asynchronous SSE streams.

**Contested & Debated Nuances:**
- **Grok** argued for streamlined single-pass verification in low-ambiguity cases to minimize latency.
- **Claude & DeepSeek** maintained that adversarial cross-critique is strictly necessary whenever subjective tradeoffs or architectural choices are present.

**Final Verdict & Actionable Recommendation:**
Adopt the hybrid routing pattern: default to PARALLEL or DEBATE for multi-dimensional inquiries, with DeepSeek handling semantic summarization and ChatGPT preserving orchestration authority.`;
    }

    return `Synthesized output from ${provider.toUpperCase()} regarding: ${cleanPrompt}`;
  }
}

export const orchestrator = new OrchestratorService();
