import { config } from 'dotenv';
import { resolve, join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Try multiple possible paths for the frontend dist
  const possiblePaths = [
    resolve(process.cwd(), 'packages/web/dist'),  // Docker: /app/packages/web/dist
    resolve(process.cwd(), '../web/dist'),         // Local from packages/server
    resolve(__dirname, '../../web/dist'),          // Relative to compiled JS
    resolve(__dirname, '../../../web/dist'),       // Another relative option
  ];

  console.log('🔍 Looking for frontend. CWD:', process.cwd());
  console.log('🔍 __dirname:', __dirname);
  console.log('🔍 Checking paths:', possiblePaths);

  const webDistPath = possiblePaths.find(p => {
    const exists = existsSync(p);
    console.log(`   ${p}: ${exists ? '✓ FOUND' : '✗ not found'}`);
    return exists;
  });

  if (webDistPath) {
    app.use(express.static(webDistPath));

    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/screenshots')) {
        res.sendFile(join(webDistPath, 'index.html'));
      }
    });

    console.log('📦 Serving frontend from', webDistPath);
  } else {
    console.warn('⚠️ Frontend dist not found!');
    // Serve a fallback message
    app.get('/', (_req, res) => {
      res.send('Dryrun API is running. Frontend not found. Check deployment logs.');
    });
  }

  app.listen(PORT, () => {
    console.log(`🚀 Dryrun server running on http://localhost:${PORT}`);
    if (isProduction) {
      console.log('🌐 Production mode - serving frontend');
    }
  });
}

main().catch(console.error);
