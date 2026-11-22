import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app';
import { MemoryOAuthStore, MemoryScheduleStore } from '../src/store';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
let server: Server;
let base = '';
const schedule = new MemoryScheduleStore({ u1: { tz: 'America/New_York' } });

beforeAll(async () => {
  // Build with a placeholder address, then pin the real one once the port is known.
  const deps = {
    schedule,
    oauth: new MemoryOAuthStore(),
    verifyIdToken: async (t: string) => {
      if (t === 'id-token-owner') return { uid: 'u1', email: 'Owner@Example.com' };
      if (t === 'id-token-stranger') return { uid: 'u2', email: 'stranger@example.com' };
      throw new Error('bad token');
    },
    allowedEmails: ['owner@example.com'],
    publicUrl: '',
  };
  const app = createApp(deps);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  deps.publicUrl = base;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const b64url = (buf: Buffer) => buf.toString('base64url');

describe('Claude connector OAuth + MCP flow', () => {
  let clientId = '';
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  let requestId = '';
  let code = '';
  let access = '';
  let refresh = '';

  it('advertises discovery metadata', async () => {
    const pr = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(pr.resource).toBe(`${base}/mcp`);
    expect(pr.authorization_servers[0]).toContain(base);
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as.authorization_endpoint).toBe(`${base}/authorize`);
    expect(as.token_endpoint).toBe(`${base}/token`);
    expect(as.registration_endpoint).toBe(`${base}/register`);
    expect(as.code_challenge_methods_supported).toContain('S256');
  });

  it('rejects MCP calls without a token and points to the metadata', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata');
  });

  it('registers Claude as a client', async () => {
    const r = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    });
    expect(r.status).toBe(201);
    clientId = (await r.json()).client_id;
    expect(clientId).toBeTruthy();
  });

  it('sends the browser to the Trinity app to approve', async () => {
    const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', state: 'st8', scope: 'trinity', resource: `${base}/mcp` });
    const r = await fetch(`${base}/authorize?${q}`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('location')!);
    expect(`${loc.origin}${loc.pathname}`).toBe(`${base}/connect`);
    requestId = loc.searchParams.get('request')!;
    const info = await (await fetch(`${base}/api/oauth/request/${requestId}`)).json();
    expect(info).toEqual({ clientName: 'Claude', redirectHost: 'claude.ai' });
  });

  it('only lets the allowed, signed-in account approve', async () => {
    const post = (token?: string) =>
      fetch(`${base}/api/oauth/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ request: requestId }),
      });
    expect((await post()).status).toBe(401);
    expect((await post('garbage')).status).toBe(401);
    expect((await post('id-token-stranger')).status).toBe(403);
    const ok = await post('id-token-owner');
    expect(ok.status).toBe(200);
    const redirect = new URL((await ok.json()).redirect);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(CALLBACK);
    expect(redirect.searchParams.get('state')).toBe('st8');
    code = redirect.searchParams.get('code')!;
    // the request is single-use
    expect((await post('id-token-owner')).status).toBe(404);
  });

  it('exchanges the code (with PKCE) for tokens, once', async () => {
    const form = (extra: Record<string, string>) =>
      fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...extra }) });
    const bad = await form({ grant_type: 'authorization_code', code, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier', redirect_uri: CALLBACK });
    expect(bad.status).toBe(400);
    const r = await form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CALLBACK });
    expect(r.status).toBe(200);
    const t = await r.json();
    access = t.access_token;
    refresh = t.refresh_token;
    expect(access && refresh).toBeTruthy();
    const again = await form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CALLBACK });
    expect(again.status).toBe(400);
  });

  it('lets Claude use the tools on the owner’s calendar', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${access}` } } });
    const client = new Client({ name: 'claude-test', version: '1' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(12);
    const r = (await client.callTool({ name: 'quick_add', arguments: { text: 'dentist tuesday at 2 for an hour' } })) as { content: { text: string }[] };
    expect(r.content[0].text).toContain('Added “Dentist”');
    const blocks = await schedule.listBlocks('u1', '2000-01-01', '2100-01-01');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ title: 'Dentist', start: 840, end: 900, source: 'claude' });
    await client.close();
  });

  it('refreshes tokens and rotates the refresh token', async () => {
    const form = (rt: string) =>
      fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: rt }) });
    const r = await form(refresh);
    expect(r.status).toBe(200);
    const t = await r.json();
    expect(t.access_token).not.toBe(access);
    expect((await form(refresh)).status).toBe(400);
  });
});
