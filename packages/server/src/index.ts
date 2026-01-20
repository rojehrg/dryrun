import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// Load .env from project root
config({ path: resolve(process.cwd(), '../../.env') });

import express from 'express';
import cors from 'cors';
import { runsRouter } from './routes/runs.js';
import { initDatabase } from './db/index.js';
import { ensureDirectories } from './utils/fs.js';

const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

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

  // In production, serve the frontend static files
  if (isProduction) {
    const webDistPath = resolve(process.cwd(), '../web/dist');

    if (existsSync(webDistPath)) {
      app.use(express.static(webDistPath));

      // SPA fallback - serve index.html for all non-API routes
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/screenshots')) {
          res.sendFile(join(webDistPath, 'index.html'));
        }
      });

      console.log('📦 Serving frontend from', webDistPath);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 Dryrun server running on http://localhost:${PORT}`);
    if (isProduction) {
      console.log('🌐 Production mode - serving frontend');
    }
  });
}

main().catch(console.error);
