import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthStore } from './store';

const ACCESS_TTL = 60 * 60; // 1 hour
const REFRESH_TTL = 90 * 24 * 60 * 60; // 90 days
const CODE_TTL = 5 * 60;
const REQUEST_TTL = 15 * 60;

interface PendingRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

interface CodeRecord {
  clientId: string;
  uid: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

interface TokenRecord {
  type: 'access' | 'refresh';
  clientId: string;
  uid: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const secret = () => randomBytes(32).toString('base64url');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * OAuth 2.1 authorization server for the Trinity connector.
 * Sign-in is handed to the Trinity app's /connect page (Google sign-in through Firebase),
 * which calls approve() with the signed-in person's uid.
 */
export class TrinityOAuthProvider implements OAuthServerProvider {
  constructor(
    private store: OAuthStore,
    private consentUrl: (requestId: string) => string,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (id) => (await this.store.get<OAuthClientInformationFull>('clients', id)) ?? undefined,
      registerClient: async (client) => {
        const full = {
          client_id: secret().slice(0, 24),
          client_id_issued_at: nowSec(),
          ...client,
        } as OAuthClientInformationFull;
        await this.store.put('clients', full.client_id, JSON.parse(JSON.stringify(full)));
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const id = secret();
    const req: PendingRequest = {
      clientId: client.client_id,
      clientName: client.client_name || 'An app',
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      expiresAt: nowSec() + REQUEST_TTL,
    };
    if (params.state !== undefined) req.state = params.state;
    if (params.resource) req.resource = params.resource.href;
    await this.store.put('requests', id, req);
    res.redirect(302, this.consentUrl(id));
  }

  /** What the consent screen shows. */
  async describeRequest(id: string): Promise<{ clientName: string; redirectHost: string } | null> {
    const r = await this.store.get<PendingRequest>('requests', id);
    if (!r || r.expiresAt < nowSec()) return null;
    return { clientName: r.clientName, redirectHost: new URL(r.redirectUri).host };
  }

  /** The person said yes: issue a one-time code and return where to send the browser. */
  async approve(id: string, uid: string): Promise<string | null> {
    const r = await this.store.get<PendingRequest>('requests', id);
    if (!r || r.expiresAt < nowSec()) return null;
    await this.store.delete('requests', id);
    const code = secret();
    const rec: CodeRecord = { clientId: r.clientId, uid, redirectUri: r.redirectUri, codeChallenge: r.codeChallenge, scopes: r.scopes, expiresAt: nowSec() + CODE_TTL };
    if (r.resource) rec.resource = r.resource;
    await this.store.put('codes', code, rec);
    const url = new URL(r.redirectUri);
    url.searchParams.set('code', code);
    if (r.state !== undefined) url.searchParams.set('state', r.state);
    return url.href;
  }

  async deny(id: string): Promise<string | null> {
    const r = await this.store.get<PendingRequest>('requests', id);
    if (!r) return null;
    await this.store.delete('requests', id);
    const url = new URL(r.redirectUri);
    url.searchParams.set('error', 'access_denied');
    url.searchParams.set('error_description', 'The person declined.');
    if (r.state !== undefined) url.searchParams.set('state', r.state);
    return url.href;
  }

  private async code(client: OAuthClientInformationFull, code: string): Promise<CodeRecord> {
    const rec = await this.store.get<CodeRecord>('codes', code);
    if (!rec || rec.clientId !== client.client_id || rec.expiresAt < nowSec()) throw new InvalidGrantError('Invalid or expired authorization code');
    return rec;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return (await this.code(client, authorizationCode)).codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const rec = await this.code(client, authorizationCode);
    await this.store.delete('codes', authorizationCode);
    if (redirectUri && redirectUri !== rec.redirectUri) throw new InvalidGrantError('redirect_uri does not match');
    return this.issue(rec.clientId, rec.uid, rec.scopes, rec.resource);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const key = hash(refreshToken);
    const rec = await this.store.get<TokenRecord>('tokens', key);
    if (!rec || rec.type !== 'refresh' || rec.clientId !== client.client_id || rec.expiresAt < nowSec()) throw new InvalidGrantError('Invalid or expired refresh token');
    await this.store.delete('tokens', key); // rotate
    return this.issue(rec.clientId, rec.uid, rec.scopes, rec.resource);
  }

  private async issue(clientId: string, uid: string, scopes: string[], resource?: string): Promise<OAuthTokens> {
    const access = secret();
    const refresh = secret();
    const base = { clientId, uid, scopes, ...(resource ? { resource } : {}) };
    await this.store.put<TokenRecord>('tokens', hash(access), { ...base, type: 'access', expiresAt: nowSec() + ACCESS_TTL });
    await this.store.put<TokenRecord>('tokens', hash(refresh), { ...base, type: 'refresh', expiresAt: nowSec() + REFRESH_TTL });
    return { access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: scopes.join(' ') || undefined };
  }

  /** A long-lived token for Trinity's chat agent (stored in an Anthropic vault) to call this server. */
  async issueAgentToken(uid: string): Promise<string> {
    const token = `tat_${secret()}`;
    await this.store.put<TokenRecord>('tokens', hash(token), { type: 'access', clientId: 'trinity-assistant', uid, scopes: ['trinity'], expiresAt: nowSec() + 10 * 365 * 24 * 60 * 60 });
    return token;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const rec = await this.store.get<TokenRecord>('tokens', hash(token));
    if (!rec || rec.type !== 'access' || rec.expiresAt < nowSec()) throw new InvalidTokenError('Invalid or expired access token');
    return {
      token,
      clientId: rec.clientId,
      scopes: rec.scopes,
      expiresAt: rec.expiresAt,
      ...(rec.resource ? { resource: new URL(rec.resource) } : {}),
      extra: { uid: rec.uid },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const key = hash(request.token);
    const rec = await this.store.get<TokenRecord>('tokens', key);
    if (rec && rec.clientId === client.client_id) await this.store.delete('tokens', key);
  }
}
