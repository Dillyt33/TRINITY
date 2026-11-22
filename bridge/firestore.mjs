// Talks to your Trinity data in Firestore as you (the same Google sign-in as the app), using plain HTTPS.

/** JS value -> Firestore REST value */
export function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}

/** Firestore REST value -> JS value */
export function decode(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([k, x]) => [k, decode(x)]));
}

export class FirebaseUser {
  /**
   * @param {{ apiKey: string, projectId: string, uid: string, refreshToken: string }} cfg
   * @param {(refreshToken: string) => void} [onRefreshToken] called when Google issues a new refresh token
   */
  constructor(cfg, onRefreshToken) {
    this.cfg = cfg;
    this.onRefreshToken = onRefreshToken;
    this.idToken = null;
    this.expiresAt = 0;
  }

  async token() {
    if (this.idToken && Date.now() < this.expiresAt - 60_000) return this.idToken;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.cfg.refreshToken }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Sign-in failed (${body?.error?.message ?? r.status}). Make a new setup code in Trinity → Settings.`);
    this.idToken = body.id_token;
    this.expiresAt = Date.now() + Number(body.expires_in ?? 3600) * 1000;
    if (body.refresh_token && body.refresh_token !== this.cfg.refreshToken) {
      this.cfg.refreshToken = body.refresh_token;
      this.onRefreshToken?.(body.refresh_token);
    }
    return this.idToken;
  }

  base() {
    return `https://firestore.googleapis.com/v1/projects/${this.cfg.projectId}/databases/(default)/documents`;
  }

  async call(url, init = {}) {
    const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Firestore ${r.status}: ${body?.error?.message ?? 'request failed'}`);
    return body;
  }

  /** Documents in users/{uid}/{collection} where field <op> value. */
  async query(collection, field, op, value, limit = 20) {
    const rows = await this.call(`${this.base()}/users/${this.cfg.uid}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: { fieldFilter: { field: { fieldPath: field }, op, value: encode(value) } },
          limit,
        },
      }),
    });
    return rows.filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), ...decodeFields(r.document.fields) }));
  }

  /** Merge fields into users/{uid}/{path}. */
  async patch(path, data) {
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    return this.call(`${this.base()}/users/${this.cfg.uid}/${path}?${mask}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }),
    });
  }
}
