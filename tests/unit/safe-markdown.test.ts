import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';

describe('SafeMarkdown Component (T1.8 & Seksi 4.3)', () => {
  it('tidak pernah memanggil atau menggunakan dangerouslySetInnerHTML', () => {
    const fnStr = SafeMarkdown.toString();
    expect(fnStr.includes('dangerouslySetInnerHTML')).toBe(false);
  });

  it('merender judul (headings #, ##, ###, ####)', () => {
    const markdown = `# Judul Utama\n## Sub Judul\n### Bagian\n#### Sub Bagian`;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    expect(html).toContain('<h1');
    expect(html).toContain('Judul Utama');
    expect(html).toContain('<h2');
    expect(html).toContain('Sub Judul');
    expect(html).toContain('<h3');
    expect(html).toContain('Bagian');
    expect(html).toContain('<h4');
    expect(html).toContain('Sub Bagian');
  });

  it('merender daftar berurutan (ordered list) dan tidak berurutan (unordered list)', () => {
    const markdown = `- Poin Pertama\n- Poin Kedua\n\n1. Langkah Satu\n2. Langkah Dua`;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    expect(html).toContain('<ul');
    expect(html).toContain('<li><span>Poin Pertama</span></li>');
    expect(html).toContain('<li><span>Poin Kedua</span></li>');

    expect(html).toContain('<ol');
    expect(html).toContain('<li><span>Langkah Satu</span></li>');
    expect(html).toContain('<li><span>Langkah Dua</span></li>');
  });

  it('merender format teks inline (tebal, miring, coret, kode inline)', () => {
    const markdown = `Teks **tebal** dan *miring* serta ~~dicoret~~ dan \`kode inline\``;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    expect(html).toContain('<strong');
    expect(html).toContain('tebal');
    expect(html).toContain('<em');
    expect(html).toContain('miring');
    expect(html).toContain('<del');
    expect(html).toContain('dicoret');
    expect(html).toContain('<code');
    expect(html).toContain('kode inline');
  });

  it('merender blok kode (fenced code block ```)', () => {
    const markdown = '```\nconst a = 10;\nconsole.log(a);\n```';
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    expect(html).toContain('<pre');
    expect(html).toContain('<code');
    expect(html).toContain('const a = 10;\nconsole.log(a);');
  });

  it('merender kutipan (blockquote >)', () => {
    const markdown = `> Catatan penting untuk rilis ini`;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    expect(html).toContain('<blockquote');
    expect(html).toContain('Catatan penting untuk rilis ini');
  });

  it('merender tautan URL aman dengan protokol https dan path relatif', () => {
    const markdown = `Kunjungi [Situs Resmi](https://omnicat.id) atau [Halaman Profil](/profile)`;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    expect(html).toContain('href="https://omnicat.id"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Situs Resmi');

    expect(html).toContain('href="/profile"');
    expect(html).toContain('Halaman Profil');
  });

  it('menolak protokol tautan berbahaya (javascript:, data:) dan merender label sebagai teks biasa tanpa elemen <a>', () => {
    const markdown = `Klik [Bahaya](javascript:alert("XSS")) atau [Data](data:text/html,<script>alert(1)</script>)`;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: markdown })
    );

    // Tidak boleh membuat tag <a href="javascript:...">
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('<a');
    expect(html).toContain('<span>Bahaya</span>');
    expect(html).toContain('<span>Data</span>');
  });

  it('KEAMANAN XSS: tidak mengeksekusi tag HTML mentah (<script>, <img>, <iframe>, <svg>)', () => {
    const malicious = `<script>alert("hacked")</script>\n<img src=x onerror=alert(1)>\n<iframe src="https://evil.com"></iframe>`;
    const html = renderToStaticMarkup(
      React.createElement(SafeMarkdown, { content: malicious })
    );

    // Harus ter-escape secara aman dan tidak boleh menjadi tag elemen DOM nyata
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;iframe src=&quot;https://evil.com&quot;&gt;&lt;/iframe&gt;');
  });
});
