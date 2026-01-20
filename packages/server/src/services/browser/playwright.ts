import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { PageState, PageElement } from '@dryrun/shared';

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(viewport: { width: number; height: number }): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
    });

    this.context = await this.browser.newContext({
      viewport,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  }

  async captureScreenshot(path: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    // Ensure directory exists
    await mkdir(dirname(path), { recursive: true });

    await this.page.screenshot({ path, fullPage: false });
  }

  async captureScreenshotBase64(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched');
    const buffer = await this.page.screenshot({ fullPage: false });
    return buffer.toString('base64');
  }

  async getPageState(): Promise<PageState> {
    if (!this.page) throw new Error('Browser not launched');

    const url = this.page.url();
    const title = await this.page.title();

    // Extract visible elements using a string to avoid bundler transformation issues
    const elements = await this.page.evaluate(`
      (() => {
        const results = [];
        const seen = new Set();

        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top < window.innerHeight &&
            rect.bottom > 0
          );
        };

        const getSelector = (el) => {
          if (el.id) return '#' + el.id;
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
            if (classes) return el.tagName.toLowerCase() + '.' + classes;
          }
          return el.tagName.toLowerCase();
        };

        const getElementType = (el) => {
          const tag = el.tagName.toLowerCase();
          if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
          if (tag === 'a') return 'link';
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
          if (tag === 'form') return 'form';
          if (tag === 'img') return 'image';
          if (['p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(tag)) return 'text';
          return 'other';
        };

        const interactiveSelectors = [
          'button', 'a[href]', 'input', 'textarea', 'select',
          '[role="button"]', '[onclick]', 'label'
        ];

        interactiveSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => {
            if (!isVisible(el)) return;

            const text = el.innerText?.trim() ||
              el.getAttribute('placeholder') ||
              el.getAttribute('aria-label') ||
              el.getAttribute('title') || '';

            if (!text || seen.has(text)) return;
            seen.add(text);

            const rect = el.getBoundingClientRect();
            results.push({
              type: getElementType(el),
              text: text.slice(0, 100),
              selector: getSelector(el),
              attributes: {
                href: el.getAttribute('href') || undefined,
                type: el.getAttribute('type') || undefined,
                name: el.getAttribute('name') || undefined,
              },
              boundingBox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            });
          });
        });

        document.querySelectorAll('h1, h2, h3, h4, p').forEach((el) => {
          if (!isVisible(el)) return;
          const text = el.innerText?.trim();
          if (!text || text.length < 3 || seen.has(text)) return;
          seen.add(text);

          const rect = el.getBoundingClientRect();
          results.push({
            type: 'text',
            text: text.slice(0, 200),
            selector: getSelector(el),
            boundingBox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        });

        return results.slice(0, 50);
      })()
    `) as PageElement[];

    return { url, title, elements };
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    try {
      // Try exact selector first
      await this.page.click(selector, { timeout: 5000 });
    } catch {
      // Fall back to text-based selector
      const textSelector = `text="${selector}"`;
      await this.page.click(textSelector, { timeout: 5000 });
    }

    // Wait for navigation or network activity to settle
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    try {
      await this.page.fill(selector, text, { timeout: 5000 });
    } catch {
      // Try clicking first then typing
      await this.page.click(selector, { timeout: 5000 });
      await this.page.keyboard.type(text);
    }
  }

  async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    const delta = direction === 'down' ? amount : -amount;
    await this.page.mouse.wheel(0, delta);
    await this.page.waitForTimeout(500);
  }

  async pressKey(key: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');
    await this.page.keyboard.press(key);
  }

  getCurrentUrl(): string {
    if (!this.page) throw new Error('Browser not launched');
    return this.page.url();
  }
}
