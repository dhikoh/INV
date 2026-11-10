import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isForbiddenIp, fetchRemoteImage } from '@/lib/files/remoteImage';
import { DomainError } from '@/lib/domain/money';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import { POST as postLogoFromUrl } from '@/app/api/v1/businesses/[id]/logo/from-url/route';
import { POST as postProductImageFromUrl } from '@/app/api/v1/products/[id]/images/from-url/route';
import { NextRequest } from 'next/server';
import * as contextModule from '@/lib/auth/context';
import { env } from '@/lib/env';

describe('Fase 5: Ambil Gambar dari URL & Pertahanan SSRF (Seksi 9 & 10.G)', () => {
  describe('isForbiddenIp() - Tabel Kasus Pemblokiran Jaringan', () => {
    const forbiddenCases: [string, string][] = [
      // IPv4 Loopback & "This" Host
      ['127.0.0.1', 'IPv4 loopback standard'],
      ['127.255.255.254', 'IPv4 loopback boundary'],
      ['0.0.0.0', 'IPv4 current network host'],
      ['0.1.2.3', 'IPv4 0.0.0.0/8 network'],

      // IPv4 Private-Use
      ['10.0.0.1', 'IPv4 Class A private'],
      ['10.255.255.255', 'IPv4 Class A private broadcast'],
      ['172.16.0.1', 'IPv4 Class B private start'],
      ['172.31.255.255', 'IPv4 Class B private end'],
      ['192.168.0.1', 'IPv4 Class C private'],
      ['192.168.1.254', 'IPv4 Class C private gateway'],

      // IPv4 Link-Local & Cloud Metadata
      ['169.254.169.254', 'AWS/GCP/Azure Cloud Metadata'],
      ['169.254.1.1', 'IPv4 Link-Local address'],

      // IPv4 CGNAT (Carrier-Grade NAT: 100.64.0.0/10)
      ['100.64.0.1', 'CGNAT start'],
      ['100.127.255.255', 'CGNAT end'],

      // IPv4 Multicast & Broadcast
      ['224.0.0.1', 'IPv4 Multicast start'],
      ['239.255.255.255', 'IPv4 Multicast end'],
      ['240.0.0.1', 'IPv4 Reserved/Future use'],
      ['255.255.255.255', 'IPv4 Broadcast'],

      // IPv6 Loopback & Unspecified
      ['::1', 'IPv6 loopback'],
      ['::', 'IPv6 unspecified'],

      // IPv6 ULA (Unique Local Address fc00::/7)
      ['fc00::1', 'IPv6 ULA prefix fc'],
      ['fd12:3456:789a::1', 'IPv6 ULA prefix fd'],

      // IPv6 Link-Local
      ['fe80::1', 'IPv6 link-local'],
      ['fe80::dead:beef', 'IPv6 link-localEUI-64'],

      // IPv6 Multicast
      ['ff02::1', 'IPv6 multicast all nodes'],
      ['ff01::1', 'IPv6 node-local multicast'],

      // IPv6 Site-Local
      ['fec0::1', 'IPv6 deprecated site-local'],

      // IPv6 Documentation
      ['2001:db8::1', 'IPv6 documentation prefix'],

      // IPv4-mapped IPv6 (dotted)
      ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
      ['::ffff:192.168.1.1', 'IPv4-mapped private Class C'],
      ['::ffff:10.0.0.1', 'IPv4-mapped private Class A'],
      ['::ffff:169.254.169.254', 'IPv4-mapped cloud metadata'],

      // IPv4-mapped IPv6 (hex words)
      ['::ffff:7f00:1', 'IPv4-mapped hex 127.0.0.1'],
      ['::ffff:c0a8:0101', 'IPv4-mapped hex 192.168.1.1'],
      ['::ffff:0a00:0001', 'IPv4-mapped hex 10.0.0.1'],

      // 6to4 encapsulation (2002::/16)
      ['2002:7f00:0001::', '6to4 encapsulating 127.0.0.1'],
      ['2002:c0a8:0101::', '6to4 encapsulating 192.168.1.1'],
    ];

    it.each(forbiddenCases)('menolak alamat terlarang: %s (%s)', (ip) => {
      expect(isForbiddenIp(ip)).toBe(true);
    });

    const allowedCases: [string, string][] = [
      ['8.8.8.8', 'Google Public DNS'],
      ['1.1.1.1', 'Cloudflare Public DNS'],
      ['93.184.216.34', 'example.com IPv4 publik'],
      ['172.32.0.1', 'IPv4 di luar rentang Class B private'],
      ['100.128.0.1', 'IPv4 di luar rentang CGNAT'],
      ['::ffff:8.8.8.8', 'IPv4-mapped IPv6 publik (dotted)'],
      ['::ffff:0808:0808', 'IPv4-mapped IPv6 publik (hex)'],
      ['2001:4860:4860::8888', 'Google Public DNS IPv6'],
      ['2606:4700:4700::1111', 'Cloudflare Public DNS IPv6'],
    ];

    it.each(allowedCases)('mengizinkan alamat publik sah: %s (%s)', (ip) => {
      expect(isForbiddenIp(ip)).toBe(false);
    });

    it('menolak input kosong atau invalid', () => {
      expect(isForbiddenIp('')).toBe(true);
      expect(isForbiddenIp('invalid-ip-string')).toBe(true);
    });
  });

  describe('fetchRemoteImage() - Validasi URL & Protokol', () => {
    it('menolak URL dengan protokol HTTP biasa (422)', async () => {
      await expect(
        fetchRemoteImage('http://example.com/logo.png')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        message: expect.stringContaining('HTTPS'),
      });
    });

    it('menolak URL yang memuat kredensial user:pass (422)', async () => {
      await expect(
        fetchRemoteImage('https://admin:secret@example.com/logo.png')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        message: expect.stringContaining('kredensial'),
      });
    });

    it('menolak URL dengan port non-standar selain 443 (422)', async () => {
      await expect(
        fetchRemoteImage('https://example.com:8443/logo.png')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        message: expect.stringContaining('Port selain 443'),
      });
    });

    it('menolak format URL yang tidak valid (422)', async () => {
      await expect(
        fetchRemoteImage('bukan-sebuah-url')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
      });
    });
  });

  describe('fetchRemoteImage() - Pengujian Jaringan & Aliran Data', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('menolak koneksi jika DNS mengarah ke IP privat (403 Forbidden)', async () => {
      // Mock dns.lookup agar mengembalikan IP privat 127.0.0.1
      vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
        const callback = args.find((a) => typeof a === 'function') as (
          err: null,
          address: string,
          family: number
        ) => void;
        callback(null, '127.0.0.1', 4);
      });

      await expect(
        fetchRemoteImage('https://internal.company.corp/logo.png')
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
        message: expect.stringContaining('jaringan privat'),
      });
    });

    it('menolak pengalihan (redirect) yang mengarah ke alamat IP privat (403 Forbidden)', async () => {
      vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
        const hostname = String(args[0]);
        const callback = args.find((a) => typeof a === 'function') as (
          err: null,
          address: string,
          family: number
        ) => void;
        if (hostname === 'internal.corp') {
          callback(null, '10.0.0.1', 4); // IP privat pada hop kedua
        } else {
          callback(null, '93.184.216.34', 4); // IP publik pada hop pertama
        }
      });

      // Type assertion khusus mock HTTP internal
      vi.spyOn(https, 'request').mockImplementation((url, opts: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = new EventEmitter() as http.ClientRequest;
        req.destroy = vi.fn().mockImplementation(() => {
          req.emit('close');
          return req;
        });
        req.end = vi.fn().mockImplementation(() => {
          const lookupFn = (opts as { lookup?: (host: string, opts: unknown, cb: (err: Error | null) => void) => void })?.lookup;
          if (lookupFn && typeof lookupFn === 'function') {
            const parsed = url instanceof URL ? url : new URL(String(url));
            lookupFn(parsed.hostname, {}, (err: Error | null) => {
              if (err) {
                req.emit('error', err);
                return;
              }
              const res = new EventEmitter() as unknown as http.IncomingMessage;
              (res as unknown as Record<string, unknown>).statusCode = 302;
              (res as unknown as Record<string, unknown>).headers = {
                location: 'https://internal.corp/secret.png',
              };
              if (callback) callback(res);
            });
            return req;
          }

          const res = new EventEmitter() as unknown as http.IncomingMessage;
          (res as unknown as Record<string, unknown>).statusCode = 302;
          (res as unknown as Record<string, unknown>).headers = {
            location: 'https://internal.corp/secret.png',
          };
          if (callback) callback(res);
          return req;
        });
        return req;
      });

      await expect(
        fetchRemoteImage('https://public.example.com/start.png')
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
        message: expect.stringContaining('jaringan privat'),
      });
    });

    it('menolak pengalihan (redirect) yang melebihi batas maksimal 3 kali (422)', async () => {
      let redirectStep = 0;
      vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
        const callback = args.find((a) => typeof a === 'function') as (
          err: null,
          address: string,
          family: number
        ) => void;
        callback(null, '93.184.216.34', 4); // Public IP
      });

      vi.spyOn(https, 'request').mockImplementation((_url, _opts, callback?: (res: http.IncomingMessage) => void) => {
        const req = new EventEmitter() as http.ClientRequest;
        req.destroy = vi.fn().mockImplementation(() => {
          req.emit('close');
          return req;
        });
        req.end = vi.fn().mockImplementation(() => {
          redirectStep++;
          const res = new EventEmitter() as unknown as http.IncomingMessage;
          (res as unknown as Record<string, unknown>).statusCode = 302;
          (res as unknown as Record<string, unknown>).headers = {
            location: `https://example.com/step-${redirectStep}.png`,
          };
          if (callback) callback(res);
          return req;
        });
        return req;
      });

      await expect(
        fetchRemoteImage('https://example.com/start.png')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        message: expect.stringContaining('Maksimal pengalihan (redirect) terlampaui'),
      });
    });

    it('membatalkan koneksi jika ukuran berkas melebihi 5 MB saat streaming (422)', async () => {
      vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
        const callback = args.find((a) => typeof a === 'function') as (
          err: null,
          address: string,
          family: number
        ) => void;
        callback(null, '93.184.216.34', 4);
      });

      vi.spyOn(https, 'request').mockImplementation((_url, _opts, callback?: (res: http.IncomingMessage) => void) => {
        const req = new EventEmitter() as http.ClientRequest;
        req.destroy = vi.fn().mockImplementation((err?: Error) => {
          if (err) req.emit('error', err);
          return req;
        });
        req.end = vi.fn().mockImplementation(() => {
          const res = new EventEmitter() as unknown as http.IncomingMessage;
          (res as unknown as Record<string, unknown>).statusCode = 200;
          (res as unknown as Record<string, unknown>).headers = {};
          if (callback) callback(res);

          // Kirim chunk 3 MB lalu chunk 3 MB lagi (> 5 MB)
          res.emit('data', Buffer.alloc(3 * 1024 * 1024));
          res.emit('data', Buffer.alloc(3 * 1024 * 1024));
          return req;
        });
        return req;
      });

      await expect(
        fetchRemoteImage('https://example.com/huge-image.png')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        message: expect.stringContaining('5 MB'),
      });
    });

    it('menolak berkas dengan magic bytes bukan format gambar (mis. PDF) (422)', async () => {
      vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
        const callback = args.find((a) => typeof a === 'function') as (
          err: null,
          address: string,
          family: number
        ) => void;
        callback(null, '93.184.216.34', 4);
      });

      vi.spyOn(https, 'request').mockImplementation((_url, _opts, callback?: (res: http.IncomingMessage) => void) => {
        const req = new EventEmitter() as http.ClientRequest;
        req.destroy = vi.fn();
        req.end = vi.fn().mockImplementation(() => {
          const res = new EventEmitter() as unknown as http.IncomingMessage;
          (res as unknown as Record<string, unknown>).statusCode = 200;
          (res as unknown as Record<string, unknown>).headers = {};
          if (callback) callback(res);

          // Kirim magic bytes PDF (%PDF-1.5)
          res.emit('data', Buffer.from('%PDF-1.5 fake pdf content'));
          res.emit('end');
          return req;
        });
        return req;
      });

      await expect(
        fetchRemoteImage('https://example.com/document.pdf')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        message: expect.stringContaining('Format PDF tidak diizinkan'),
      });
    });

    it('berhasil mengunduh dan memvalidasi berkas PNG valid', async () => {
      vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
        const callback = args.find((a) => typeof a === 'function') as (
          err: null,
          address: string,
          family: number
        ) => void;
        callback(null, '93.184.216.34', 4);
      });

      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

      vi.spyOn(https, 'request').mockImplementation((_url, _opts, callback?: (res: http.IncomingMessage) => void) => {
        const req = new EventEmitter() as http.ClientRequest;
        req.destroy = vi.fn();
        req.end = vi.fn().mockImplementation(() => {
          const res = new EventEmitter() as unknown as http.IncomingMessage;
          (res as unknown as Record<string, unknown>).statusCode = 200;
          (res as unknown as Record<string, unknown>).headers = {};
          if (callback) callback(res);

          res.emit('data', validPng);
          res.emit('end');
          return req;
        });
        return req;
      });

      const result = await fetchRemoteImage('https://example.com/logo.png');
      expect(result.mime).toBe('image/png');
      expect(result.bytes.length).toBe(validPng.length);
    });
  });

  describe('RBAC Endpoint Pengambilan Gambar dari URL', () => {
    it('menolak akses tanpa login (401) pada kedua endpoint', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
        new DomainError('UNAUTHENTICATED', 'Silakan masuk terlebih dahulu', 401)
      );

      const req1 = new NextRequest(`${env.APP_URL}/api/v1/businesses/biz_1/logo/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: env.APP_URL },
        body: JSON.stringify({ url: 'https://example.com/logo.png' }),
      });
      const res1 = await postLogoFromUrl(req1, { params: Promise.resolve({ id: 'biz_1' }) });
      expect(res1.status).toBe(401);

      vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
        new DomainError('UNAUTHENTICATED', 'Silakan masuk terlebih dahulu', 401)
      );

      const req2 = new NextRequest(`${env.APP_URL}/api/v1/products/prod_1/images/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: env.APP_URL },
        body: JSON.stringify({ url: 'https://example.com/photo.png' }),
      });
      const res2 = await postProductImageFromUrl(req2, { params: Promise.resolve({ id: 'prod_1' }) });
      expect(res2.status).toBe(401);
    });

    it('menolak akses pengguna dengan peran SALES (403) pada kedua endpoint', async () => {
      vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
        new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403)
      );

      const req1 = new NextRequest(`${env.APP_URL}/api/v1/businesses/biz_1/logo/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: env.APP_URL },
        body: JSON.stringify({ url: 'https://example.com/logo.png' }),
      });
      const res1 = await postLogoFromUrl(req1, { params: Promise.resolve({ id: 'biz_1' }) });
      expect(res1.status).toBe(403);

      vi.spyOn(contextModule, 'requireContext').mockRejectedValueOnce(
        new DomainError('FORBIDDEN', 'Anda tidak punya akses', 403)
      );

      const req2 = new NextRequest(`${env.APP_URL}/api/v1/products/prod_1/images/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: env.APP_URL },
        body: JSON.stringify({ url: 'https://example.com/photo.png' }),
      });
      const res2 = await postProductImageFromUrl(req2, { params: Promise.resolve({ id: 'prod_1' }) });
      expect(res2.status).toBe(403);
    });
  });
});
