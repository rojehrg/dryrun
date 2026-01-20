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

            // For inputs, prioritize placeholder and aria-label
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
            const placeholder = el.getAttribute('placeholder');
            const ariaLabel = el.getAttribute('aria-label');
            const name = el.getAttribute('name');
            const inputType = el.getAttribute('type');

            let text = '';
            if (isInput) {
              // For inputs, use placeholder or aria-label as primary identifier
              text = placeholder || ariaLabel || name || inputType || 'input';
            } else {
              text = el.innerText?.trim() ||
                ariaLabel ||
                el.getAttribute('title') || '';
            }

            if (!text || seen.has(text)) return;
            seen.add(text);

            const rect = el.getBoundingClientRect();
            results.push({
              type: getElementType(el),
              text: text.slice(0, 100),
              selector: getSelector(el),
              attributes: {
                href: el.getAttribute('href') || undefined,
                type: inputType || undefined,
                name: name || undefined,
                placeholder: placeholder || undefined,
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

    const strategies = [
      // Try exact selector first
      () => this.page!.click(selector, { timeout: 3000 }),
      // Try as text content
      () => this.page!.click(`text="${selector}"`, { timeout: 3000 }),
      // Try as partial text (case insensitive)
      () => this.page!.click(`text=${selector}`, { timeout: 3000 }),
      // Try role-based
      () => this.page!.getByRole('button', { name: selector }).click({ timeout: 3000 }),
      () => this.page!.getByRole('link', { name: selector }).click({ timeout: 3000 }),
      // Try placeholder/label
      () => this.page!.getByPlaceholder(selector).click({ timeout: 3000 }),
      () => this.page!.getByLabel(selector).click({ timeout: 3000 }),
    ];

    let lastError: Error | null = null;
    for (const strategy of strategies) {
      try {
        await strategy();
        // Wait for navigation or network activity to settle
        await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        return;
      } catch (e) {
        lastError = e as Error;
      }
    }

    throw new Error(`Could not click "${selector}": ${lastError?.message || 'element not found'}`);
  }

  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched');

    const strategies = [
      // Try exact selector
      () => this.page!.fill(selector, text, { timeout: 3000 }),
      // Try common input selectors
      () => this.page!.fill(`input[name="${selector}"]`, text, { timeout: 3000 }),
      () => this.page!.fill(`input[placeholder*="${selector}" i]`, text, { timeout: 3000 }),
      () => this.page!.fill(`textarea[placeholder*="${selector}" i]`, text, { timeout: 3000 }),
      // Try by label
      () => this.page!.getByLabel(selector).fill(text, { timeout: 3000 }),
      // Try by placeholder
      () => this.page!.getByPlaceholder(selector).fill(text, { timeout: 3000 }),
      // Try by role
      () => this.page!.getByRole('textbox', { name: selector }).fill(text, { timeout: 3000 }),
      () => this.page!.getByRole('searchbox').fill(text, { timeout: 3000 }),
      // Try common search input patterns
      () => this.page!.fill('input[type="search"]', text, { timeout: 3000 }),
      () => this.page!.fill('input[name="search"]', text, { timeout: 3000 }),
      () => this.page!.fill('input[name="q"]', text, { timeout: 3000 }),
      () => this.page!.fill('#searchInput', text, { timeout: 3000 }),
      () => this.page!.fill('[role="searchbox"]', text, { timeout: 3000 }),
    ];

    let lastError: Error | null = null;
    for (const strategy of strategies) {
      try {
        await strategy();
        return;
      } catch (e) {
        lastError = e as Error;
      }
    }

    // Last resort: click and type manually
    try {
      const input = await this.page.$('input:visible, textarea:visible, [contenteditable="true"]:visible');
      if (input) {
        await input.click();
        await this.page.keyboard.type(text);
        return;
      }
    } catch {
      // Continue to error
    }

    throw new Error(`Could not type into "${selector}": ${lastError?.message || 'input not found'}`);
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
