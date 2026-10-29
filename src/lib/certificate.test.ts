import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('@/lib/pdfjsLoader', () => ({ getPdfJsLib: () => new Promise(() => {}) })); // CDN «висить»

const publicFile = (url: string) => readFileSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')));
const bytesResponse = (buf: Buffer, type: string) => new Response(new Uint8Array(buf), { status: 200, headers: { 'Content-Type': type } });

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('генерація сертифіката', () => {
  it('прев’ю не блокується, якщо PDF.js не завантажується', async () => {
    const { renderPdfPreview } = await import('@/lib/certificate');
    expect(await renderPdfPreview(new Uint8Array(10), 100, 50)).toBeNull();
  });

  it('з файлів проєкту створює коректний PDF з українським ім’ям', async () => {
    vi.stubGlobal('fetch', async (url: string) => bytesResponse(publicFile(url), 'application/octet-stream'));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }));
    const { generatePersonalizedPdf } = await import('@/lib/certificate');
    const out = await generatePersonalizedPdf("Лук'янов Олексій Петрович");
    expect(out.pdfBlob.size).toBeGreaterThan(1000);
    const buf = await new Promise<ArrayBuffer>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(out.pdfBlob);
    });
    const doc = await PDFDocument.load(new Uint8Array(buf));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(out.pdfBytes.length).toBeGreaterThan(1000);
  });

  it('сервер віддає index.html замість файлу — зрозуміла помилка, а не «Unknown font format»', async () => {
    vi.stubGlobal('fetch', async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const { generatePersonalizedPdf } = await import('@/lib/certificate');
    await expect(generatePersonalizedPdf('Іваненко Олексій')).rejects.toThrow(/пошкоджені або відсутні/);
  });

  it('файли шрифту й бланка справді лежать у public/', () => {
    expect(publicFile('/fonts/Roboto-Bold.ttf').length).toBeGreaterThan(50_000);
    expect(publicFile('/certificate-template.pdf').subarray(0, 4).toString()).toBe('%PDF');
  });
});
