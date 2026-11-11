import fs from 'fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer-core';
import { DomainError } from '../domain/money';

export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(timeoutMs: number): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    return new Promise<() => void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;
      let handled = false;

      const tryRun = () => {
        if (handled) return;
        handled = true;
        if (timer) clearTimeout(timer);
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      };

      timer = setTimeout(() => {
        if (handled) return;
        handled = true;
        const idx = this.queue.indexOf(tryRun);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new DomainError('PDF_BUSY', 'Coba lagi sebentar', 503));
      }, timeoutMs);

      this.queue.push(tryRun);
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
        return;
      }
    }
    this.current = Math.max(0, this.current - 1);
  }

  get activeCount(): number {
    return this.current;
  }

  get queueCount(): number {
    return this.queue.length;
  }
}

export function findChromeExecutable(): string {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidates.push(
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
      '/usr/local/bin/chromium'
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return envPath || '/usr/bin/chromium';
}

const RENDER_TIMEOUT_MS = 20000;
export const pdfSemaphore = new Semaphore(2);

let browserInstance: Browser | null = null;
let browserLaunchingPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  if (browserLaunchingPromise) {
    return browserLaunchingPromise;
  }

  browserLaunchingPromise = (async () => {
    const executablePath = findChromeExecutable();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--font-render-hinting=none',
      ],
    });

    browser.on('disconnected', () => {
      browserInstance = null;
      browserLaunchingPromise = null;
    });

    browserInstance = browser;
    browserLaunchingPromise = null;
    return browser;
  })();

  return browserLaunchingPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // ignore
    }
    browserInstance = null;
  }
}

export function renderReactToHtml(element: React.ReactElement): string {
  return '<!DOCTYPE html>' + renderToStaticMarkup(element);
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const release = await pdfSemaphore.acquire(RENDER_TIMEOUT_MS);
  let page: Page | null = null;
  try {
    const renderPromise = (async () => {
      const browser = await getBrowser();
      page = await browser.newPage();

      await page.setRequestInterception(true);
      page.on('request', (req: HTTPRequest) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('about:')) {
          req.continue();
        } else {
          req.abort();
        }
      });

      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
      });

      const pdfUint8 = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '18mm',
          bottom: '20mm',
          left: '14mm',
          right: '14mm',
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="font-size: 8px; font-family: sans-serif; text-align: center; width: 100%; color: #64748b;">Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></div>',
      });

      return Buffer.from(pdfUint8);
    })();

    const buffer = await Promise.race([
      renderPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DomainError('PDF_BUSY', 'Coba lagi sebentar', 503)), RENDER_TIMEOUT_MS)
      ),
    ]);

    return buffer;
  } catch (err: unknown) {
    if (err instanceof DomainError) throw err;
    const errObj = err as { name?: string; message?: string };
    if (errObj?.name === 'TimeoutError' || errObj?.message?.includes('timeout')) {
      throw new DomainError('PDF_BUSY', 'Coba lagi sebentar', 503);
    }
    throw err;
  } finally {
    if (page) {
      try {
        await (page as Page).close();
      } catch {
        // ignore page close error
      }
    }
    release();
  }
}

export async function renderReactToPdf(element: React.ReactElement): Promise<Buffer> {
  const html = renderReactToHtml(element);
  return renderHtmlToPdf(html);
}
