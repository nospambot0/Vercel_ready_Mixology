import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'hillview_manage_session';
const SESSION_VALUE = 'authenticated';
const SESSION_MAX_AGE = 8 * 60 * 60;


type RequestLike = {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  end(body?: string): void;
};

function getEnv(name: 'SESSION_SECRET' | 'MANAGE_PASSWORD'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured in the Vercel project environment.`);
  }
  return value;
}

function sign(value: string): string {
  return createHmac('sha256', getEnv('SESSION_SECRET'))
    .update(value)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\//g, '_')
    .replace(/\+/g, '-');
}

function signedSessionValue(): string {
  return `s:${SESSION_VALUE}.${sign(SESSION_VALUE)}`;
}

function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const cookieHeader = Array.isArray(header) ? header.join(';') : header ?? '';
  return Object.fromEntries(
    cookieHeader.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [];
      const key = part.slice(0, separator).trim();
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return key ? [[key, value]] : [];
    }),
  );
}

export function isValidSession(value: string | undefined): boolean {
  if (!value?.startsWith('s:')) return false;
  const unsignedValue = value.slice(2).split('.')[0];
  const signature = value.slice(2).slice(unsignedValue.length + 1);
  if (unsignedValue !== SESSION_VALUE || !signature) return false;

  const expected = sign(unsignedValue);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function sendJson(res: ResponseLike, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function setSessionCookie(res: ResponseLike, value: string, maxAge: number): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

function readPassword(body: unknown): unknown {
  if (body && typeof body === 'object' && 'password' in body) {
    return body.password;
  }

  if (typeof body !== 'string') return undefined;

  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? parsed.password : undefined;
  } catch {
    return undefined;
  }
}

function matchesPassword(candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false;
  const expected = Buffer.from(getEnv('MANAGE_PASSWORD'));
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function handleSession(req: RequestLike, res: ResponseLike): void {
  const cookies = parseCookies(req.headers.cookie);
  sendJson(res, 200, {
    authenticated: isValidSession(cookies[SESSION_COOKIE]),
  });
}

export function handleLogin(req: RequestLike, res: ResponseLike): void {
  if (!matchesPassword(readPassword(req.body))) {
    sendJson(res, 401, { message: 'Invalid password' });
    return;
  }

  setSessionCookie(res, signedSessionValue(), SESSION_MAX_AGE);
  sendJson(res, 200, { authenticated: true });
}

export function handleLogout(_req: RequestLike, res: ResponseLike): void {
  setSessionCookie(res, '', 0);
  sendJson(res, 200, { authenticated: false });
}