import express, { type Request, type Response, type Router } from 'express';
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TrinityOAuthProvider } from './oauth';
import { createHash } from 'node:crypto';
import type { Sender } from './reminders';
import type { OAuthStore, PushStore, ScheduleStore } from './store';
import { buildServer } from './tools';

export interface AppDeps {
  schedule: ScheduleStore;
  oauth: OAuthStore;
  /** Checks a Firebase ID token from the Trinity app. Throws if invalid. */
  verifyIdToken: (idToken: string) => Promise<{ uid: string; email?: string }>;
  /** Google accounts allowed to connect. Empty = any signed-in account (each only sees their own data). */
  allowedEmails?: string[];
  defaultTz?: string;
  /** Where the Trinity app (and its /connect page) lives. Defaults to the same address as this server. */
  appUrl?: string;
  /** Force the public address (tests); otherwise taken from the request. */
  publicUrl?: string;
  /** Notifications (step 2). */
  push?: { store: PushStore; publicKey: string; send: () => Sender };
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.set('trust proxy', true);
  const routers = new Map<string, Router>();
  const allowed = (deps.allowedEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

  function baseOf(req: Request): string {
    if (deps.publicUrl) return deps.publicUrl.replace(/\/$/, '');
    const first = (h: string | string[] | undefined) => (Array.isArray(h) ? h[0] : h)?.split(',')[0].trim();
    const host = first(req.headers['x-forwarded-host']) || req.headers.host || 'localhost';
    const proto = first(req.headers['x-forwarded-proto']) || req.protocol || 'https';
    return `${proto}://${host}`;
  }

  async function signedIn(req: Request): Promise<{ uid: string; email?: string } | null> {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return null;
    try {
      return await deps.verifyIdToken(token);
    } catch {
      return null;
    }
  }

  function routerFor(base: string): Router {
    const existing = routers.get(base);
    if (existing) return existing;
    const appBase = (deps.appUrl || base).replace(/\/$/, '');
    const provider = new TrinityOAuthProvider(deps.oauth, (id) => `${appBase}/connect?request=${encodeURIComponent(id)}`);
    const mcpUrl = new URL('/mcp', base);
    const r = express.Router();

    // OAuth: discovery metadata, client registration, /authorize, /token, /revoke
    r.use(
      mcpAuthRouter({
        provider,
        issuerUrl: new URL(base),
        resourceServerUrl: mcpUrl,
        resourceName: 'Trinity',
        scopesSupported: ['trinity'],
        authorizationOptions: { rateLimit: false },
        clientRegistrationOptions: { rateLimit: false },
        tokenOptions: { rateLimit: false },
        revocationOptions: { rateLimit: false },
      }),
    );

    // MCP endpoint (stateless: a fresh server per request, scoped to the token's owner)
    const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });
    r.post('/mcp', bearer, express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
      const uid = req.auth?.extra?.uid as string | undefined;
      if (!uid) {
        res.status(401).json({ error: 'invalid_token' });
        return;
      }
      const server = buildServer({ store: deps.schedule, uid, defaultTz: deps.defaultTz });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (e) {
        console.error('mcp error', e);
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    });
    const notAllowed = (_req: Request, res: Response) => {
      res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    };
    r.get('/mcp', notAllowed);
    r.delete('/mcp', notAllowed);

    // Consent API used by the Trinity app's /connect page
    const cors = (req: Request, res: Response, next: () => void) => {
      const origin = req.headers.origin;
      if (origin && (origin === appBase || origin === base)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    };
    r.use('/api', cors);
    r.get('/api/oauth/request/:id', async (req: Request, res: Response) => {
      const d = await provider.describeRequest(String(req.params.id));
      if (!d) res.status(404).json({ error: 'expired' });
      else res.json(d);
    });
    r.post('/api/oauth/approve', express.json(), async (req: Request, res: Response) => {
      const user = await signedIn(req);
      if (!user) {
        res.status(401).json({ error: 'sign_in_required' });
        return;
      }
      if (allowed.length && !allowed.includes((user.email ?? '').toLowerCase())) {
        res.status(403).json({ error: 'not_allowed', message: 'This Google account isn’t allowed to connect Trinity.' });
        return;
      }
      const redirect = await provider.approve(String(req.body?.request ?? ''), user.uid);
      if (!redirect) res.status(404).json({ error: 'expired' });
      else res.json({ redirect });
    });
    r.post('/api/oauth/deny', express.json(), async (req: Request, res: Response) => {
      const redirect = await provider.deny(String(req.body?.request ?? ''));
      if (!redirect) res.status(404).json({ error: 'expired' });
      else res.json({ redirect });
    });
    // Notifications: the app registers each device that should get reminders.
    r.get('/api/push/key', (_req: Request, res: Response) => {
      if (!deps.push?.publicKey) res.status(503).json({ error: 'push_not_configured' });
      else res.json({ publicKey: deps.push.publicKey });
    });
    r.post('/api/push/subscribe', express.json(), async (req: Request, res: Response) => {
      const user = await signedIn(req);
      if (!user) return void res.status(401).json({ error: 'sign_in_required' });
      if (!deps.push) return void res.status(503).json({ error: 'push_not_configured' });
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return void res.status(400).json({ error: 'bad_subscription' });
      const id = createHash('sha256').update(String(sub.endpoint)).digest('hex').slice(0, 24);
      await deps.push.store.putDevice(user.uid, {
        id,
        endpoint: String(sub.endpoint),
        keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) },
        label: String(req.body?.label ?? 'Device').slice(0, 80),
        createdAt: Date.now(),
      });
      res.json({ ok: true, id });
    });
    r.post('/api/push/unsubscribe', express.json(), async (req: Request, res: Response) => {
      const user = await signedIn(req);
      if (!user) return void res.status(401).json({ error: 'sign_in_required' });
      if (!deps.push) return void res.status(503).json({ error: 'push_not_configured' });
      const id = createHash('sha256').update(String(req.body?.endpoint ?? '')).digest('hex').slice(0, 24);
      await deps.push.store.deleteDevice(user.uid, id);
      res.json({ ok: true });
    });
    r.post('/api/push/test', express.json(), async (req: Request, res: Response) => {
      const user = await signedIn(req);
      if (!user) return void res.status(401).json({ error: 'sign_in_required' });
      if (!deps.push) return void res.status(503).json({ error: 'push_not_configured' });
      const devices = await deps.push.store.listDevices(user.uid);
      const send = deps.push.send();
      let ok = 0;
      for (const d of devices) {
        const result = await send(d, { title: 'Trinity is set up', body: 'This is how reminders and check-ins will look.', url: '/', tag: 'test' });
        if (result === 'ok') ok++;
        if (result === 'gone') await deps.push.store.deleteDevice(user.uid, d.id);
      }
      res.json({ devices: devices.length, delivered: ok });
    });

    r.get('/api/health', (_req, res) => {
      res.json({ ok: true, mcp: mcpUrl.href });
    });

    routers.set(base, r);
    return r;
  }

  app.use((req, res, next) => routerFor(baseOf(req))(req, res, next));
  return app;
}
