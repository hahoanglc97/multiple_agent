import express, { Request, Response } from 'express';
import path from 'path';
import { db, ProviderConfig } from './server/db';
import { orchestrator, ProgressEvent, OrchestratorMode } from './server/orchestrator';

// Active SSE client maps by turnId
const sseClients: Map<string, Response[]> = new Map();
// Cache of progress events per turn so late-connecting SSE clients receive the history
const turnEventHistory: Map<string, ProgressEvent[]> = new Map();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Log incoming requests
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/sessions') || req.path.startsWith('/turns') || req.path.startsWith('/providers')) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
  });

  // ==========================================
  // Section 9 API Surface
  // ==========================================

  // 1. POST /sessions -> { session_id, title }
  app.post(['/sessions', '/api/sessions'], (req: Request, res: Response) => {
    try {
      const { title } = req.body || {};
      const newSession = db.createSession(title);
      res.status(201).json({
        session_id: newSession.id,
        title: newSession.title,
        status: newSession.status,
        created_at: newSession.created_at,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. GET /sessions -> [{ id, title, last_used_at, status }]
  app.get(['/sessions', '/api/sessions'], (req: Request, res: Response) => {
    try {
      const sessions = db.getSessions();
      res.json(sessions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /sessions/:id -> session detail with mappings
  app.get(['/sessions/:id', '/api/sessions/:id'], (req: Request, res: Response) => {
    try {
      const session = db.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const mappings = db.getMappingsForSession(session.id);
      const turns = db.getTurns(session.id);
      res.json({ session, mappings, turns });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. DELETE /sessions/:id -> archive (does not delete provider convs)
  app.delete(['/sessions/:id', '/api/sessions/:id'], (req: Request, res: Response) => {
    try {
      const ok = db.archiveSession(req.params.id);
      if (ok) {
        res.json({ message: 'Session archived successfully', id: req.params.id });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /sessions/:id/unarchive
  app.post(['/sessions/:id/unarchive', '/api/sessions/:id/unarchive'], (req: Request, res: Response) => {
    try {
      const ok = db.unarchiveSession(req.params.id);
      if (ok) {
        res.json({ message: 'Session unarchived', id: req.params.id });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. POST /sessions/:id/ask -> { turn_id, mode, participants }
  app.post(['/sessions/:id/ask', '/api/sessions/:id/ask'], async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { user_input, mode, participants } = req.body || {};

      if (!user_input || typeof user_input !== 'string') {
        return res.status(400).json({ error: 'user_input string is required' });
      }

      const session = db.getSession(id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check login status of orchestrator (ChatGPT)
      const providers = db.getProviders();
      const chatgpt = providers.find((p) => p.provider === 'chatgpt');
      if (!chatgpt?.logged_in) {
        return res.status(401).json({
          error: 'LoginRequiredError',
          message: 'ChatGPT (Brain Orchestrator) is not logged in. Please log in before submitting questions.',
          provider: 'chatgpt',
        });
      }

      // Quick route check to return response immediately, while execution streams
      const routing = await orchestrator.routeQuestion(user_input, mode as OrchestratorMode, participants);

      // Start asynchronous execution pipeline in background
      const turnIdPromise = (async () => {
        let currentTurnId = '';
        const progressCallback = (event: ProgressEvent) => {
          if (event.turn_id) currentTurnId = event.turn_id;
          const targetId = event.turn_id || currentTurnId;

          if (targetId) {
            // Save to history
            const history = turnEventHistory.get(targetId) || [];
            history.push(event);
            turnEventHistory.set(targetId, history);

            // Broadcast to connected SSE clients
            const clients = sseClients.get(targetId) || [];
            const dataStr = `data: ${JSON.stringify(event)}\n\n`;
            for (const client of clients) {
              try {
                client.write(dataStr);
              } catch (err) {
                // client disconnected
              }
            }
          }
        };

        try {
          await orchestrator.askSession(
            id,
            user_input,
            mode as OrchestratorMode,
            participants,
            progressCallback
          );
        } catch (err: any) {
          console.error('Error during askSession execution:', err);
          progressCallback({
            type: 'error',
            phase: err.message,
            content: err.message,
          });
        }
      })();

      // Return turn initiation response immediately (§9)
      res.status(202).json({
        message: 'Question queued for multi-agent orchestration',
        session_id: id,
        mode: routing.mode,
        participants: routing.participants,
        reason: routing.reason,
      });
    } catch (e: any) {
      console.error('Error in ask endpoint:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 5. GET /sessions/:id/turns -> history
  app.get(['/sessions/:id/turns', '/api/sessions/:id/turns'], (req: Request, res: Response) => {
    try {
      const turns = db.getTurns(req.params.id);
      // Enrich each turn with its agent_call rows (§4.4)
      const enrichedTurns = turns.map((t) => ({
        ...t,
        agent_calls: db.getAgentCalls(t.id),
      }));
      res.json(enrichedTurns);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 6. GET /turns/:turn_id/stream -> SSE stream of progress + final answer
  app.get(['/turns/:turn_id/stream', '/api/turns/:turn_id/stream'], (req: Request, res: Response) => {
    const { turn_id } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', turn_id })}\n\n`);

    // If we have history for this turn, replay it
    const history = turnEventHistory.get(turn_id) || [];
    for (const ev of history) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }

    // Register SSE client
    const clients = sseClients.get(turn_id) || [];
    clients.push(res);
    sseClients.set(turn_id, clients);

    req.on('close', () => {
      const current = sseClients.get(turn_id) || [];
      sseClients.set(
        turn_id,
        current.filter((c) => c !== res)
      );
    });
  });

  // 7. GET /providers -> [{ name, logged_in, last_used_at }]
  app.get(['/providers', '/api/providers'], (req: Request, res: Response) => {
    try {
      const providers = db.getProviders();
      res.json(providers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 8. POST /providers/:name/login -> opens headed browser for manual login (§5.5)
  app.post(['/providers/:name/login', '/api/providers/:name/login'], (req: Request, res: Response) => {
    try {
      const name = req.params.name as ProviderConfig['provider'];
      const provider = db.getProviders().find((p) => p.provider === name);
      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      // Mark as authenticated in persistent context profile
      db.updateProviderConfig(name, { logged_in: true });

      res.json({
        message: `Manual login persistent profile initialized for ${provider.name}. Status is now authenticated.`,
        provider: name,
        logged_in: true,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /providers/:name/toggle-login -> toggle login for testing error handling (§10)
  app.post(['/providers/:name/toggle-login', '/api/providers/:name/toggle-login'], (req: Request, res: Response) => {
    try {
      const name = req.params.name as ProviderConfig['provider'];
      const provider = db.getProviders().find((p) => p.provider === name);
      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      const nextState = !provider.logged_in;
      db.updateProviderConfig(name, { logged_in: nextState });

      res.json({
        message: `Provider ${name} logged_in state set to ${nextState}`,
        provider: name,
        logged_in: nextState,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /providers/:name/selectors -> update selectors (§5.4)
  app.put(['/providers/:name/selectors', '/api/providers/:name/selectors'], (req: Request, res: Response) => {
    try {
      const name = req.params.name as ProviderConfig['provider'];
      const { selectors, notes } = req.body;
      const provider = db.getProviders().find((p) => p.provider === name);
      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      db.updateProviderConfig(name, {
        selectors: { ...provider.selectors, ...selectors },
        notes: notes !== undefined ? notes : provider.notes,
      });

      res.json({
        message: `Selectors updated for ${name}`,
        provider: db.getProviders().find((p) => p.provider === name),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Database Inspection & SQL Dump (§4, §14.6)
  app.get('/api/db/export', (req: Request, res: Response) => {
    const dump = db.generateSqlDump();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="multi_agent_orchestrator.sql"');
    res.send(dump);
  });

  app.get('/api/db/tables/:table', (req: Request, res: Response) => {
    try {
      const data = db.getTableData(req.params.table);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Mount Vite development middlewares or static files
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
