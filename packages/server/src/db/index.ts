import Database from 'better-sqlite3';
import type {
  Run,
  RunEvent,
  FrictionPoint,
  RunStatus,
  EventType,
  FrictionSeverity,
  FrictionCategory,
  FrictionPattern,
  ElementReference,
} from '@dryrun/shared';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): void {
  const dbPath = process.env.DATABASE_PATH || './data/dryrun.db';
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      goal TEXT NOT NULL,
      archetype_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      summary_json TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      screenshot_path TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friction_points (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'contentClarity',
      pattern TEXT,
      element_json TEXT,
      heuristic_violation TEXT,
      wcag_violation TEXT,
      screenshot_path TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
    CREATE INDEX IF NOT EXISTS idx_friction_points_run_id ON friction_points(run_id);
  `);

  // Migration: Add new columns to existing friction_points table if they don't exist
  // SQLite doesn't support IF NOT EXISTS for columns, so we check and add
  try {
    const tableInfo = db.prepare('PRAGMA table_info(friction_points)').all() as Array<{
      name: string;
    }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    if (!existingColumns.has('category')) {
      db.exec("ALTER TABLE friction_points ADD COLUMN category TEXT NOT NULL DEFAULT 'contentClarity'");
    }
    if (!existingColumns.has('pattern')) {
      db.exec('ALTER TABLE friction_points ADD COLUMN pattern TEXT');
    }
    if (!existingColumns.has('element_json')) {
      db.exec('ALTER TABLE friction_points ADD COLUMN element_json TEXT');
    }
    if (!existingColumns.has('heuristic_violation')) {
      db.exec('ALTER TABLE friction_points ADD COLUMN heuristic_violation TEXT');
    }
    if (!existingColumns.has('wcag_violation')) {
      db.exec('ALTER TABLE friction_points ADD COLUMN wcag_violation TEXT');
    }
  } catch {
    // Columns already exist or table doesn't exist yet
  }

  console.log('✅ Database initialized');
}

// Run operations
export function createRun(run: Run): Run {
  const stmt = getDb().prepare(`
    INSERT INTO runs (id, url, goal, archetype_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(run.id, run.url, run.goal, run.archetypeId, run.status, run.createdAt);
  return run;
}

export function getRun(id: string): Run | null {
  const stmt = getDb().prepare('SELECT * FROM runs WHERE id = ?');
  const row = stmt.get(id) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

export function getAllRuns(): Run[] {
  const stmt = getDb().prepare('SELECT * FROM runs ORDER BY created_at DESC');
  const rows = stmt.all() as RunRow[];
  return rows.map(rowToRun);
}

export function updateRunStatus(id: string, status: RunStatus, completedAt?: string): void {
  const stmt = getDb().prepare(`
    UPDATE runs SET status = ?, completed_at = ? WHERE id = ?
  `);
  stmt.run(status, completedAt || null, id);
}

export function updateRunSummary(id: string, summary: Run['summary']): void {
  const stmt = getDb().prepare('UPDATE runs SET summary_json = ? WHERE id = ?');
  stmt.run(JSON.stringify(summary), id);
}

// Event operations
export function createEvent(event: RunEvent): RunEvent {
  const stmt = getDb().prepare(`
    INSERT INTO events (id, run_id, type, data_json, screenshot_path, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    event.id,
    event.runId,
    event.type,
    JSON.stringify(event.data),
    event.screenshotPath || null,
    event.timestamp
  );
  return event;
}

export function getEventsByRunId(runId: string): RunEvent[] {
  const stmt = getDb().prepare('SELECT * FROM events WHERE run_id = ? ORDER BY timestamp ASC');
  const rows = stmt.all(runId) as EventRow[];
  return rows.map(rowToEvent);
}

// Friction point operations
export function createFrictionPoint(fp: FrictionPoint): FrictionPoint {
  const stmt = getDb().prepare(`
    INSERT INTO friction_points (
      id, run_id, description, severity, category, pattern,
      element_json, heuristic_violation, wcag_violation, screenshot_path, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    fp.id,
    fp.runId,
    fp.description,
    fp.severity,
    fp.category,
    fp.pattern || null,
    fp.element ? JSON.stringify(fp.element) : null,
    fp.heuristicViolation || null,
    fp.wcagViolation || null,
    fp.screenshotPath || null,
    fp.timestamp
  );
  return fp;
}

export function getFrictionPointsByRunId(runId: string): FrictionPoint[] {
  const stmt = getDb().prepare(
    'SELECT * FROM friction_points WHERE run_id = ? ORDER BY timestamp ASC'
  );
  const rows = stmt.all(runId) as FrictionPointRow[];
  return rows.map(rowToFrictionPoint);
}

// Type conversion helpers
interface RunRow {
  id: string;
  url: string;
  goal: string;
  archetype_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  summary_json: string | null;
}

interface EventRow {
  id: string;
  run_id: string;
  type: string;
  data_json: string;
  screenshot_path: string | null;
  timestamp: string;
}

interface FrictionPointRow {
  id: string;
  run_id: string;
  description: string;
  severity: string;
  category: string;
  pattern: string | null;
  element_json: string | null;
  heuristic_violation: string | null;
  wcag_violation: string | null;
  screenshot_path: string | null;
  timestamp: string;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    url: row.url,
    goal: row.goal,
    archetypeId: row.archetype_id,
    status: row.status as RunStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
    summary: row.summary_json ? JSON.parse(row.summary_json) : undefined,
  };
}

function rowToEvent(row: EventRow): RunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    type: row.type as EventType,
    data: JSON.parse(row.data_json),
    screenshotPath: row.screenshot_path || undefined,
    timestamp: row.timestamp,
  };
}

function rowToFrictionPoint(row: FrictionPointRow): FrictionPoint {
  return {
    id: row.id,
    runId: row.run_id,
    description: row.description,
    severity: row.severity as FrictionSeverity,
    category: (row.category || 'contentClarity') as FrictionCategory,
    pattern: (row.pattern || undefined) as FrictionPattern | undefined,
    element: row.element_json ? (JSON.parse(row.element_json) as ElementReference) : undefined,
    heuristicViolation: row.heuristic_violation || undefined,
    wcagViolation: row.wcag_violation || undefined,
    screenshotPath: row.screenshot_path || undefined,
    timestamp: row.timestamp,
  };
}
