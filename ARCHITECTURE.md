# Dryrun - AI-Powered UX Testing

> Run AI agents through your product flows to discover friction points before your users do.

## Overview

Dryrun is an agentic AI system that simulates real users navigating your website. Unlike traditional automated testing (Selenium, Cypress), Dryrun doesn't follow scripts—it makes autonomous decisions based on user personas, detecting UX friction that would cause real users to abandon.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, TailwindCSS, TanStack Query | Web UI for creating tests and viewing reports |
| **Backend** | Express.js, Node.js 20 | API server, test orchestration |
| **Browser Automation** | Playwright | Headless Chromium for navigating sites |
| **AI/LLM** | Google Gemini 2.0 Flash | Decision-making, friction detection, recommendations |
| **Database** | SQLite (better-sqlite3) | Storing runs, events, friction points |
| **Build** | Turbo, pnpm workspaces | Monorepo management |
| **Deployment** | Docker, Railway | Production hosting |

---

## Project Structure

```
dryrun/
├── packages/
│   ├── shared/           # Shared TypeScript types
│   │   └── src/
│   │       └── index.ts  # All type definitions
│   │
│   ├── server/           # Backend API + Agent
│   │   └── src/
│   │       ├── index.ts           # Express server entry
│   │       ├── routes/
│   │       │   └── runs.ts        # API endpoints
│   │       ├── services/
│   │       │   ├── agent/
│   │       │   │   ├── archetypes.ts  # 8 user personas
│   │       │   │   └── runner.ts      # Agent execution loop
│   │       │   ├── browser/
│   │       │   │   └── playwright.ts  # Browser control
│   │       │   └── llm/
│   │       │       └── gemini.ts      # LLM integration
│   │       ├── db/
│   │       │   └── index.ts       # SQLite operations
│   │       └── utils/
│   │           └── fs.ts          # File system helpers
│   │
│   └── web/              # Frontend React app
│       └── src/
│           ├── pages/
│           │   ├── Home.tsx       # Test creation
│           │   ├── Run.tsx        # Live test view
│           │   └── Report.tsx     # Results & recommendations
│           ├── api/
│           │   └── client.ts      # API client
│           └── components/
│               └── Layout.tsx
│
├── Dockerfile            # Production container
├── railway.json          # Railway deployment config
└── ARCHITECTURE.md       # This file
```

---

## Core Concepts

### 1. Agent Loop

The heart of Dryrun is an autonomous agent loop:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ┌─────────────┐                                        │
│   │ Get Page    │ ← Playwright captures DOM + screenshot │
│   │ State       │                                        │
│   └──────┬──────┘                                        │
│          ↓                                               │
│   ┌─────────────┐                                        │
│   │ LLM Decides │ ← Gemini analyzes as persona          │
│   │ Next Action │   Returns: action + friction check    │
│   └──────┬──────┘                                        │
│          ↓                                               │
│   ┌─────────────┐                                        │
│   │ Execute     │ ← Click, type, scroll, navigate       │
│   │ Action      │                                        │
│   └──────┬──────┘                                        │
│          ↓                                               │
│   ┌─────────────┐                                        │
│   │ Check Exit  │ ← Goal reached? Too much friction?    │
│   │ Conditions  │   Stuck? Max steps?                   │
│   └──────┬──────┘                                        │
│          │                                               │
│          └──────────→ Loop (max 50 iterations)          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Location:** `packages/server/src/services/agent/runner.ts`

### 2. Archetypes (User Personas)

8 built-in personas that behave differently:

| Archetype | Category | Behavior |
|-----------|----------|----------|
| Impatient Commuter | General | Mobile, skims, low patience, abandons fast |
| Cautious First-Timer | General | Reads everything, needs reassurance |
| Power User | General | Skips tutorials, expects shortcuts |
| Screen Reader User | Accessibility | Keyboard-only, checks WCAG compliance |
| Elderly User | Demographic | Slow, needs large text, simple patterns |
| Distracted Parent | Contextual | Gets interrupted, needs save/resume |
| International User | Demographic | No idioms, flexible date/phone formats |
| Skeptical Shopper | Contextual | Needs trust signals, transparent pricing |

**Location:** `packages/server/src/services/agent/archetypes.ts`

### 3. Custom Archetypes

Users can create custom personas with:
- Name & description
- Patience level (low/medium/high)
- Reading style (skim/thorough/skip)
- Tech literacy (low/moderate/high)
- Device (mobile/tablet/desktop)
- Friction tolerance (1-5 points before abandoning)
- Focus areas (navigation, forms, accessibility, etc.)

The system auto-generates a behavioral prompt from these settings.

**Location:** `createCustomArchetype()` in `archetypes.ts`

### 4. Friction Detection

The LLM detects friction during navigation:

```typescript
interface FrictionPoint {
  description: string;           // "Button is too small to tap"
  severity: 'low' | 'medium' | 'high';
  category: FrictionCategory;    // navigation, forms, accessibility, etc.
  pattern?: FrictionPattern;     // repeatedClicks, backtracking, etc.
  element?: ElementReference;    // Which element caused it
  heuristicViolation?: string;   // "Nielsen #4: Consistency"
  wcagViolation?: string;        // "WCAG 2.4.4: Link Purpose"
}
```

**Categories:**
- `navigation` - Can't find where to go
- `forms` - Validation, labels, field issues
- `contentClarity` - Jargon, unclear instructions
- `visualDesign` - Contrast, touch targets, hierarchy
- `performance` - Slow loading, unresponsive
- `accessibility` - WCAG violations, keyboard issues

**Patterns (auto-detected):**
- `repeatedClicks` - Clicked same element 2+ times
- `backtracking` - Returned to previous page
- `scrollHunting` - Scrolled up/down searching
- `formAbandonment` - Started but didn't complete form
- `hesitation` - Multiple reasoning steps without action
- `errorRecovery` - Recovering from an error

### 5. Recommendations

After a test, the LLM generates actionable recommendations:

```typescript
interface Recommendation {
  title: string;              // "Make CTA button more prominent"
  description: string;        // Detailed explanation
  type: RecommendationType;   // quickWin, majorChange, contentFix, bugFix, enhancement
  effort: 'easy' | 'medium' | 'hard';
  priority: 1-5;              // Based on severity × archetype priority
  category: FrictionCategory;
  currentState?: string;      // "Button says 'Submit'"
  suggestedState?: string;    // "Change to 'Create Account'"
  affectedArchetypes: string[];
  impactScore: number;        // 1-10
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/runs/archetypes` | List all archetypes |
| POST | `/api/runs` | Create and start a new test run |
| GET | `/api/runs` | List all runs |
| GET | `/api/runs/:id` | Get run details with events and friction |
| POST | `/api/runs/:id/stop` | Stop a running test |
| GET | `/api/runs/:id/stream` | SSE stream for real-time updates |

### Create Run Request

```typescript
// Using preset archetype
POST /api/runs
{
  "url": "https://example.com/signup",
  "goal": "Complete the signup flow",
  "archetypeId": "impatient-commuter"
}

// Using custom archetype
POST /api/runs
{
  "url": "https://example.com/signup",
  "goal": "Complete the signup flow",
  "customArchetype": {
    "name": "Budget Shopper",
    "description": "Price-conscious user looking for deals",
    "patience": "medium",
    "readingStyle": "skim",
    "techLiteracy": "moderate",
    "device": "mobile",
    "maxFrictionPoints": 3,
    "focusAreas": ["forms", "contentClarity"]
  }
}
```

---

## Database Schema

```sql
-- Test runs
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  goal TEXT NOT NULL,
  archetype_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, running, completed, failed, stopped
  created_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT               -- RunSummary as JSON
);

-- Events during a run
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,             -- navigation, click, type, scroll, friction, etc.
  data_json TEXT NOT NULL,
  screenshot_path TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- Detected friction points
CREATE TABLE friction_points (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT DEFAULT 'contentClarity',
  pattern TEXT,
  element_json TEXT,
  heuristic_violation TEXT,
  wcag_violation TEXT,
  screenshot_path TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google AI API key |
| `PORT` | No | 3001 (dev), 3000 (prod) | Server port |
| `NODE_ENV` | No | development | Environment mode |
| `DATABASE_PATH` | No | ./data/dryrun.db | SQLite database path |

---

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Create .env file
cp .env.example .env
# Add your GEMINI_API_KEY

# Run development servers
pnpm dev
# Server: http://localhost:3001
# Web: http://localhost:5173
```

### Build

```bash
pnpm build
```

### Project Commands

```bash
pnpm dev      # Start all packages in dev mode
pnpm build    # Build all packages
pnpm lint     # Lint all packages
```

---

## Deployment

### Railway (Recommended)

1. Push to GitHub
2. Connect repo to Railway
3. Set Builder to "Dockerfile"
4. Add `GEMINI_API_KEY` environment variable
5. Generate domain

### Docker

```bash
docker build -t dryrun .
docker run -p 3000:3000 -e GEMINI_API_KEY=your-key dryrun
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/shared/src/index.ts` | All TypeScript type definitions |
| `packages/server/src/services/agent/archetypes.ts` | Archetype definitions and custom archetype generator |
| `packages/server/src/services/agent/runner.ts` | Main agent loop, pattern detection, severity weighting |
| `packages/server/src/services/llm/gemini.ts` | LLM prompts for decisions and recommendations |
| `packages/server/src/db/index.ts` | Database schema and operations |
| `packages/web/src/pages/Home.tsx` | Test creation UI with custom archetype form |
| `packages/web/src/pages/Report.tsx` | Results UI with recommendations display |

---

## Future Improvements

Potential enhancements:
- [ ] Save and reuse custom archetypes
- [ ] Compare runs across archetypes
- [ ] Export reports as PDF
- [ ] Scheduled/recurring tests
- [ ] Team collaboration features
- [ ] Integration with CI/CD pipelines
- [ ] More LLM providers (OpenAI, Claude)
- [ ] Video recording of test runs
- [ ] Accessibility-specific test mode
- [ ] Performance metrics tracking

---

## Links

- **GitHub:** https://github.com/rojehrg/dryrun
- **Gemini API:** https://aistudio.google.com/apikey
- **Railway:** https://railway.app
