import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import type { Run, CreateRunRequest, RunResponse, RunEvent, FrictionPoint, AgentArchetype } from '@dryrun/shared';
import {
  createRun,
  getRun,
  getAllRuns,
  getEventsByRunId,
  getFrictionPointsByRunId,
  updateRunStatus,
} from '../db/index.js';
import { getRunner, getArchetype, getAllArchetypes, createCustomArchetype } from '../services/agent/index.js';

export const runsRouter: RouterType = Router();

// In-memory event streams for SSE
const runEventStreams = new Map<string, Set<Response>>();

// Get all archetypes
runsRouter.get('/archetypes', (_req: Request, res: Response) => {
  res.json(getAllArchetypes());
});

// Create and start a new run
runsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateRunRequest;

    // Validate request - need either archetypeId OR customArchetype
    if (!body.url || !body.goal) {
      res.status(400).json({ error: 'Missing required fields: url, goal' });
      return;
    }

    if (!body.archetypeId && !body.customArchetype) {
      res.status(400).json({ error: 'Must provide either archetypeId or customArchetype' });
      return;
    }

    // Get or create archetype
    let archetype: AgentArchetype | undefined;
    let archetypeId: string;

    // Device viewport mappings
    const deviceViewports = {
      mobile: { width: 390, height: 844 },
      tablet: { width: 1024, height: 768 },
      desktop: { width: 1440, height: 900 },
    };

    if (body.customArchetype) {
      // Validate custom archetype input
      const custom = body.customArchetype;
      if (!custom.name || !custom.description || !custom.patience ||
          !custom.readingStyle || !custom.techLiteracy || !custom.device ||
          !custom.maxFrictionPoints) {
        res.status(400).json({
          error: 'Custom archetype missing required fields: name, description, patience, readingStyle, techLiteracy, device, maxFrictionPoints'
        });
        return;
      }

      // Validate maxFrictionPoints range
      if (custom.maxFrictionPoints < 1 || custom.maxFrictionPoints > 5) {
        res.status(400).json({ error: 'maxFrictionPoints must be between 1 and 5' });
        return;
      }

      archetype = createCustomArchetype(custom);
      archetypeId = archetype.id;
    } else {
      // Use preset archetype
      const baseArchetype = getArchetype(body.archetypeId!);
      if (!baseArchetype) {
        res.status(400).json({ error: `Invalid archetype: ${body.archetypeId}` });
        return;
      }

      // Apply device override if specified
      if (body.device && deviceViewports[body.device]) {
        archetype = {
          ...baseArchetype,
          constraints: {
            ...baseArchetype.constraints,
            viewport: deviceViewports[body.device],
          },
        };
      } else {
        archetype = baseArchetype;
      }
      archetypeId = body.archetypeId!;
    }

    // Create run
    const run: Run = {
      id: uuid(),
      url: body.url,
      goal: body.goal,
      archetypeId: archetypeId,
      archetypeName: archetype.name, // Store the display name
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    createRun(run);

    // Start the run in background
    const runner = getRunner();

    // Set up event streaming
    runEventStreams.set(run.id, new Set());

    runner
      .run(run, archetype, {
        onEvent: (event: RunEvent) => {
          broadcastToRun(run.id, 'event', event);
        },
        onFriction: (friction: FrictionPoint) => {
          broadcastToRun(run.id, 'friction', friction);
        },
        onComplete: (completedRun: Run) => {
          broadcastToRun(run.id, 'complete', completedRun);
          // Clean up streams after a delay
          setTimeout(() => {
            runEventStreams.delete(run.id);
          }, 5000);
        },
      })
      .catch((error) => {
        console.error('Run error:', error);
        broadcastToRun(run.id, 'error', { message: String(error) });
      });

    res.status(201).json(run);
  } catch (error) {
    console.error('Error creating run:', error);
    res.status(500).json({ error: 'Failed to create run' });
  }
});

// Get all runs
runsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const runs = getAllRuns();
    res.json(runs);
  } catch (error) {
    console.error('Error getting runs:', error);
    res.status(500).json({ error: 'Failed to get runs' });
  }
});

// Get a specific run with events and friction points
runsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const run = getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const events = getEventsByRunId(run.id);
    const frictionPoints = getFrictionPointsByRunId(run.id);

    const response: RunResponse = {
      run,
      events,
      frictionPoints,
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting run:', error);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// Stop a running test
runsRouter.post('/:id/stop', (req: Request, res: Response) => {
  try {
    const run = getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    if (run.status !== 'running') {
      res.status(400).json({ error: 'Run is not currently running' });
      return;
    }

    const runner = getRunner();
    runner.stop();

    updateRunStatus(run.id, 'stopped', new Date().toISOString());

    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping run:', error);
    res.status(500).json({ error: 'Failed to stop run' });
  }
});

// SSE endpoint for real-time updates
runsRouter.get('/:id/stream', (req: Request, res: Response) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Add to streams
  let streams = runEventStreams.get(run.id);
  if (!streams) {
    streams = new Set();
    runEventStreams.set(run.id, streams);
  }
  streams.add(res);

  // Send initial state
  const events = getEventsByRunId(run.id);
  const frictionPoints = getFrictionPointsByRunId(run.id);

  res.write(
    `data: ${JSON.stringify({ type: 'init', run, events, frictionPoints })}\n\n`
  );

  // Clean up on close
  req.on('close', () => {
    streams?.delete(res);
  });
});

function broadcastToRun(runId: string, type: string, data: unknown): void {
  const streams = runEventStreams.get(runId);
  if (!streams) return;

  const message = `data: ${JSON.stringify({ type, data })}\n\n`;
  streams.forEach((res) => {
    try {
      res.write(message);
    } catch {
      streams.delete(res);
    }
  });
}
