export interface PythonFile {
  path: string;
  category: 'core' | 'db' | 'providers' | 'orchestrator' | 'compression' | 'sessions';
  description: string;
  code: string;
}

export const PYTHON_CODEBASE: PythonFile[] = [
  {
    path: 'app/main.py',
    category: 'core',
    description: 'FastAPI entrypoint with lifespan event, CORS, and routers',
    code: `"""FastAPI application entrypoint for Multi-Agent Web UI Orchestrator."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.db.session import init_db
from app.sessions.browser_pool import browser_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orchestrator")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and default selectors
    await init_db()
    logger.info("Database initialized.")
    yield
    # Clean shutdown of browser pool
    await browser_pool.close_all()
    logger.info("Browser pool closed.")

app = FastAPI(
    title="Multi-Agent Web UI Orchestrator",
    description="Browser-automated multi-agent orchestration without direct API calls",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
`
  },
  {
    path: 'app/db/models.py',
    category: 'db',
    description: 'SQLAlchemy async ORM models matching §4 Data Model',
    code: `"""SQLAlchemy async database models."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class ToolSession(Base):
    __tablename__ = "tool_session"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")  # 'active' | 'archived'

    mappings = relationship("SessionMapping", back_populates="session", cascade="all, delete-orphan")
    turns = relationship("Turn", back_populates="session", cascade="all, delete-orphan")

class SessionMapping(Base):
    __tablename__ = "session_mapping"

    tool_session_id = Column(String, ForeignKey("tool_session.id"), primary_key=True)
    provider = Column(String, primary_key=True)  # 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'deepseek'
    provider_session_ref = Column(String, nullable=False)  # URL or ID of the conversation on that provider
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ToolSession", back_populates="mappings")

class Turn(Base):
    __tablename__ = "turn"

    id = Column(String, primary_key=True, default=generate_uuid)
    tool_session_id = Column(String, ForeignKey("tool_session.id"), nullable=False)
    user_input = Column(Text, nullable=False)
    mode = Column(String, nullable=False)  # 'SINGLE' | 'PARALLEL' | 'DEBATE' | 'VERIFY'
    participants = Column(Text, nullable=False)  # JSON array
    final_answer = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    duration_ms = Column(Integer, default=0)

    session = relationship("ToolSession", back_populates="turns")
    agent_calls = relationship("AgentCall", back_populates="turn", cascade="all, delete-orphan")

class AgentCall(Base):
    __tablename__ = "agent_call"

    id = Column(String, primary_key=True, default=generate_uuid)
    turn_id = Column(String, ForeignKey("turn.id"), nullable=False)
    provider = Column(String, nullable=False)
    role = Column(String, nullable=False)  # 'answer' | 'critique' | 'synthesis' | 'judge' | 'summarize'
    prompt_sent = Column(Text, nullable=False)
    response_text = Column(Text, nullable=True)
    token_est_in = Column(Integer, default=0)
    token_est_out = Column(Integer, default=0)
    status = Column(String, default="success")  # 'success' | 'timeout' | 'selector_error' | 'login_required'
    error_msg = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)

    turn = relationship("Turn", back_populates="agent_calls")

class SummaryCache(Base):
    __tablename__ = "summary_cache"

    content_hash = Column(String, primary_key=True)  # SHA256 of source content
    level = Column(String, primary_key=True)         # 'DETAILED' | 'SUMMARY' | 'ABSTRACT'
    summary_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ProviderConfig(Base):
    __tablename__ = "provider_config"

    provider = Column(String, primary_key=True)
    chat_url = Column(String, nullable=False)
    selectors = Column(Text, nullable=False)  # JSON
    updated_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)
`
  },
  {
    path: 'app/providers/base.py',
    category: 'providers',
    description: 'WebProvider abstract base class with streaming DOM hash detection (§5.1 & §5.3)',
    code: `"""WebProvider abstract base class for Playwright browser automation."""
import hashlib
import asyncio
from abc import ABC, abstractmethod
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

class LoginRequiredError(Exception):
    """Raised when provider session is unauthenticated."""
    pass

class SelectorError(Exception):
    """Raised when expected DOM selector fails to resolve."""
    pass

class WebProvider(ABC):
    name: str
    login_url: str
    chat_url: str

    def __init__(self, selectors: dict):
        self.selectors = selectors

    @abstractmethod
    async def is_logged_in(self, page: Page) -> bool:
        """Check if persistent profile is authenticated."""
        pass

    @abstractmethod
    async def create_new_session(self, page: Page) -> str:
        """Start a new conversation; return stable session_ref (URL or ID)."""
        pass

    @abstractmethod
    async def resume_session(self, page: Page, ref: str) -> None:
        """Navigate to an existing conversation by ref."""
        pass

    @abstractmethod
    async def submit_prompt(self, page: Page, text: str) -> None:
        """Paste text into input and trigger send."""
        pass

    async def wait_for_response(self, page: Page, timeout_s: int = 180) -> str:
        """
        Streaming detection strategy (§5.3):
        1. Record hash of last message DOM text.
        2. Poll every 500ms.
        3. Complete when: (a) stop button absent AND (b) hash stable for 2s.
        """
        container_sel = self.selectors.get("last_message_container")
        stop_sel = self.selectors.get("stop_button")
        
        last_hash = ""
        stable_count = 0
        elapsed = 0.0

        while elapsed < timeout_s:
            try:
                el = await page.query_selector(container_sel)
                current_text = await el.inner_text() if el else ""
                current_hash = hashlib.sha256(current_text.encode('utf-8')).hexdigest()

                stop_btn = await page.query_selector(stop_sel)
                is_generating = stop_btn is not None and await stop_btn.is_visible()

                if current_hash == last_hash and len(current_text) > 0 and not is_generating:
                    stable_count += 1
                    if stable_count >= 4:  # 4 * 500ms = 2 consecutive seconds
                        return current_text
                else:
                    stable_count = 0
                    last_hash = current_hash

            except Exception:
                pass

            await asyncio.sleep(0.5)
            elapsed += 0.5

        raise TimeoutError(f"Generation timed out after {timeout_s}s on {self.name}")

    @abstractmethod
    async def get_current_session_ref(self, page: Page) -> str:
        """Return current conversation URL/ref after sending."""
        pass
`
  },
  {
    path: 'app/orchestrator/brain.py',
    category: 'orchestrator',
    description: 'ChatGPT Brain Router & Orchestrator Decision Engine (§7.1)',
    code: `"""ChatGPT-as-orchestrator ("Brain") router logic."""
import json
import logging
from app.providers.base import WebProvider
from playwright.async_api import Page

logger = logging.getLogger(__name__)

ROUTING_PROMPT = """You are an orchestrator. Given the user question, choose ONE mode:
- SINGLE: one model suffices
- PARALLEL: query 2-3 models in parallel, then synthesize
- DEBATE: multi-model debate (controversial / multi-perspective questions)
- VERIFY: one model answers, others verify

Respond in strict JSON:
{"mode": "...", "participants": ["claude","gemini",...], "reason": "..."}

User question:
{question}
"""

class BrainOrchestrator:
    def __init__(self, chatgpt_provider: WebProvider):
        self.provider = chatgpt_provider

    async def decide_route(self, page: Page, question: str) -> dict:
        prompt = ROUTING_PROMPT.format(question=question)
        await self.provider.submit_prompt(page, prompt)
        response_text = await self.provider.wait_for_response(page)

        try:
            # Parse strict JSON
            # Extract bracketed JSON if wrapped in markdown
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start != -1 and end != 0:
                data = json.loads(response_text[start:end])
                mode = data.get("mode", "PARALLEL").upper()
                participants = data.get("participants", ["claude", "gemini"])
                return {
                    "mode": mode,
                    "participants": participants,
                    "reason": data.get("reason", "Automated routing decision by ChatGPT brain.")
                }
        except Exception as err:
            logger.warning(f"Failed to parse ChatGPT router JSON: {err}. Defaulting to PARALLEL.")

        # Default fallback
        return {
            "mode": "PARALLEL",
            "participants": ["claude", "gemini"],
            "reason": "Fallback default routing due to non-JSON orchestrator response."
        }
`
  },
  {
    path: 'app/compression/summarizer.py',
    category: 'compression',
    description: 'Semantic Compression with DeepSeek adapter and SHA256 cache (§8)',
    code: `"""Semantic compression module using DeepSeek via browser automation."""
import hashlib
from app.db.models import SummaryCache
from app.providers.base import WebProvider
from playwright.async_api import Page

SUMMARIZER_PROMPT = """You are a semantic compressor. Compress the following into a shorter version ({level}) that preserves:
1. Core conclusion (1-2 sentences)
2. Concrete facts, numbers, names mentioned (keep exact values)
3. Points of disagreement with opposing views (if any)
Remove: filler, restatement, hedging, politeness.
Source: {content}
Output only the compressed text.
"""

class SemanticCompressor:
    def __init__(self, deepseek_provider: WebProvider, session_factory):
        self.provider = deepseek_provider
        self.session_factory = session_factory

    async def compress(self, page: Page, content: str, level: str = "DETAILED") -> str:
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

        # 1. Check SQLite cache
        async with self.session_factory() as db:
            cached = await db.get(SummaryCache, (content_hash, level))
            if cached:
                return cached.summary_text

        # 2. Query DeepSeek browser adapter
        prompt = SUMMARIZER_PROMPT.format(level=level, content=content)
        await self.provider.submit_prompt(page, prompt)
        compressed = await self.provider.wait_for_response(page)

        # 3. Store in cache
        async with self.session_factory() as db:
            new_cache = SummaryCache(
                content_hash=content_hash,
                level=level,
                summary_text=compressed.strip()
            )
            db.add(new_cache)
            await db.commit()

        return compressed.strip()
`
  },
  {
    path: 'app/orchestrator/debate.py',
    category: 'orchestrator',
    description: '3-Round Adversarial Debate Pipeline (§7.2)',
    code: `"""3-Round Adversarial Debate Pipeline."""
import asyncio
from typing import List, Dict
from app.providers.base import WebProvider
from app.compression.summarizer import SemanticCompressor

class DebatePipeline:
    def __init__(self, compressor: SemanticCompressor, brain_provider: WebProvider):
        self.compressor = compressor
        self.brain = brain_provider

    async def run(
        self,
        pages: Dict[str, any],
        providers: Dict[str, WebProvider],
        participants: List[str],
        question: str,
        turn_id: str
    ) -> str:
        # Round 1 — Independent answers
        round1_tasks = [
            providers[p].submit_prompt(pages[p], question)
            for p in participants
        ]
        await asyncio.gather(*round1_tasks)

        round1_answers = {}
        for p in participants:
            round1_answers[p] = await providers[p].wait_for_response(pages[p])

        # Round 2 — Cross-critique with DETAILED semantic compression
        compressed_answers = {}
        for p in participants:
            compressed = await self.compressor.compress(pages["deepseek"], round1_answers[p], "DETAILED")
            compressed_answers[p] = compressed

        critique_tasks = []
        for p in participants:
            other_peers = [f"[{peer.upper()}]: {comp}" for peer, comp in compressed_answers.items() if peer != p]
            critique_prompt = (
                f"Original: {question}\\n\\nPeer arguments:\\n"
                + "\\n\\n".join(other_peers)
                + "\\n\\nTask: Critique in 200 words max — strengths, weaknesses, and whether your view changes."
            )
            critique_tasks.append(providers[p].submit_prompt(pages[p], critique_prompt))
        await asyncio.gather(*critique_tasks)

        critiques = {}
        for p in participants:
            critiques[p] = await providers[p].wait_for_response(pages[p])

        # Round 3 — Judge (ChatGPT Brain) with SUMMARY compression
        summary_critiques = []
        for p in participants:
            summary_comp = await self.compressor.compress(pages["deepseek"], critiques[p], "SUMMARY")
            summary_critiques.append(f"[{p.upper()} Critique]: {summary_comp}")

        judge_prompt = (
            f"Original Question: {question}\\n\\nPeer Critiques:\\n"
            + "\\n\\n".join(summary_critiques)
            + "\\n\\nTask: Synthesize final answer, explicitly annotating consensus points vs contested points."
        )
        await self.brain.submit_prompt(pages["chatgpt"], judge_prompt)
        final_answer = await self.brain.wait_for_response(pages["chatgpt"])

        return final_answer
`
  }
];
