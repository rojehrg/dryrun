import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export async function ensureDirectories(): Promise<void> {
  const screenshotsPath = process.env.SCREENSHOTS_PATH || './data/screenshots';
  const dbPath = process.env.DATABASE_PATH || './data/dryrun.db';

  await mkdir(screenshotsPath, { recursive: true });
  await mkdir(dirname(dbPath), { recursive: true });
}

export function getScreenshotPath(runId: string, eventId: string): string {
  const basePath = process.env.SCREENSHOTS_PATH || './data/screenshots';
  return `${basePath}/${runId}/${eventId}.png`;
}

export function getScreenshotUrl(runId: string, eventId: string): string {
  return `/screenshots/${runId}/${eventId}.png`;
}
