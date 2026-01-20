import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '../../.env') });

import express from 'express';
import cors from 'cors';
import { runsRouter } from './routes/runs.js';
import { initDatabase } from './db/index.js';
import { ensureDirectories } from './utils/fs.js';

const PORT = process.env.PORT || 3001;

async function main() {
  // Ensure data directories exist
  await ensureDirectories();

  // Initialize database
  initDatabase();

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve screenshots statically
  app.use('/screenshots', express.static(process.env.SCREENSHOTS_PATH || './data/screenshots'));

  // Routes
  app.use('/api/runs', runsRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.listen(PORT, () => {
    console.log(`🚀 Dryrun server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
