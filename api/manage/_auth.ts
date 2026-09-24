import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'hillview_manage_session';
const OTP_COOKIE = 'hillview_manage_otp';
const SESSION_VALUE = 'authenticated';
const SESSION_MAX_AGE = 8 * 60 * 60;
const OTP_MAX_AGE = 10 * 60;
const OTP_RESEND_COOLDOWN = 60;

type RequestLike = {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  end(body?: string): void;
};

function getEnv(name: 'SESSION_SECRET' | 'RESEND_API_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured in the Vercel project environment.`);
  }
  return value;
}

function sign(value: string): string {
  return createHmac('sha256', getEnv('SESSION_SECRET'))
    .update(value)
    .digest('base64url');
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

function safeEqual(a: string, b: string): boolean {
  const actual = Buffer.from(a);
  const expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isValidSession(value: string | undefined): boolean {
  if (!value?.startsWith('s:')) return false;
  const unsignedValue = value.slice(2).split('.')[0];
  const signature = value.slice(2).slice(unsignedValue.length + 1);
  if (unsignedValue !== SESSION_VALUE || !signature) return false;
  return safeEqual(signature, sign(unsignedValue));
}

function sendJson(res: ResponseLike, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function setCookie(res: ResponseLike, name: string, value: string, maxAge: number): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

function clearCookie(res: ResponseLike, name: string): void {
  setCookie(res, name, '', 0);
}

function readBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object') return body as Record<string, unknown>;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isAllowedStaffEmail(email: string): boolean {
  if (!email || ! email.includes('@')) return false;
  const configured = (process.env.STAFF_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length) return configured.includes(email);

  const domain = (process.env.STAFF_EMAIL_DOMAIN ?? 'mixology.monster').trim().toLowerCase();
  return domain ? email.endsWith(`@${domain}`) : false;
}

function createOtpToken(email: string, code: string, issuedAt: number): string {
  const payload = Buffer.from(JSON.stringify({ email, code, issuedAt }), 'utf8').toString('base64url');
  return `o:${payload}.${sign(payload)}`;
}

function readOtpToken(value: string | undefined): { email: string; code: string; issuedAt: number } | null {
  if (!value?.startsWith('o:')) return null;
  const body = value.slice(2);
  const separator = body.lastIndexOf('.');
  if (separator < 0) return null;
  const payload = body.slice(0, separator);
  const signature = body.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed.email !== 'string' || typeof parsed.code !== 'string' || typeof parsed.issuedAt !== 'number') return null;
    if (!/^\d{6}$/.test(parsed.code)) return null;
    if (Date.now() - parsed.issuedAt > OTP_MAX_AGE * 1000) return null;
    return { email: parsed.email, code: parsed.code, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = getEnv('RESEND_API_KEY');
  const from = 'staff@mixology.monster';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Mixology PRO staff login code',
      text: `Your Mixology PRO staff login code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,sans-serif;color:#171717"><div style="max-width:520px;margin:30px auto;background:#fff;padding:32px;border:1px solid #ddd;border-radius:18px"><div style="font-size:11px;letter-spacing:3px;color:#777">MIXOLOGY PRO / STAFF ACCESS</div><h1 style="margin:10px 0 6px;font-size:28px">Your login code</h1><p style="color:#666;font-size:14px;line-height:1.6">Use this one-time verification code to access the staff area.</p><div style="margin:26px 0;text-align:center;background:#f4f4f2;border-radius:14px;padding:20px;font-size:34px;font-weight:800;letter-spacing:8px">${code}</div><p style="color:#777;font-size:12px">This code expires in 10 minutes and can only be used once.</p></div></body></html>`,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || 'The email provider rejected the verification email.');
  }
}

export function handleSession(req: RequestLike, res: ResponseLike): void {
  const cookies = parseCookies(req.headers.cookie);
  sendJson(res, 200, { authenticated: isValidSession(cookies[SESSION_COOKIE]) });
}

export async function handleLogin(req: RequestLike, res: ResponseLike): Promise<void> {
  const body = readBody(req.body);
  const action = body.action === 'verify' ? 'verify' : 'send';
  const cookies = parseCookies(req.headers.cookie);

  if (action === 'send') {
    const email = normalizeEmail(body.email);
    if (!isAllowedStaffEmail(email)) {
      sendJson(res, 403, { message: 'This email is not authorized for staff access.' });
      return;
    }

    const existing = readOtpToken(cookies[OTP_COOKIE]);
    if (existing && Date.now() - existing.issuedAt < OTP_RESEND_COOLDOWN * 1000 && existing.email === email) {
      sendJson(res, 429, { message: 'Please wait a minute before requesting another code.' });
      return;
    }

    const code = randomInt(100000, 1000000).toString();
    const issuedAt = Date.now();

    try {
      await sendOtpEmail(email, code);
      setCookie(res, OTP_COOKIE, createOtpToken(email, code, issuedAt), OTP_MAX_AGE);
      sendJson(res, 200, { sent: true, email: maskEmail(email), expiresIn: OTP_MAX_AGE });
    } catch (error) {
      sendJson(res, 502, { message: error instanceof Error ? error.message : 'Could not send the verification email.' });
    }
    return;
  }

  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const otp = readOtpToken(cookies[OTP_COOKIE]);

  if (!otp || !email || otp.email !== email || !/^\d{6}$/.test(code) || !safeEqual(otp.code, code)) {
    clearCookie(res, OTP_COOKIE);
    sendJson(res, 401, { message: 'That verification code is invalid or expired.' });
    return;
  }

  clearCookie(res, OTP_COOKIE);
  setCookie(res, SESSION_COOKIE, signedSessionValue(), SESSION_MAX_AGE);
  sendJson(res, 200, { authenticated: true });
}

export function handleLogout(_req: RequestLike, res: ResponseLike): void {
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, OTP_COOKIE);
  sendJson(res, 200, { authenticated: false });
}
