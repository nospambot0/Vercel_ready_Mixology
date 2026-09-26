import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'hillview_manage_session';
const OTP_COOKIE = 'hillview_manage_otp';
const SESSION_VALUE = 'authenticated';
const SESSION_MAX_AGE = 8 * 60 * 60;
const OTP_MAX_AGE = 10 * 60;
const OTP_RESEND_COOLDOWN = 60;
const STAFF_OTP_EMAILS = ['r.rakeshdas401@gmail.com', 'ekalabyapradhan70@gmail.com'] as const;
const DEFAULT_STAFF_OTP_EMAIL = STAFF_OTP_EMAILS[0];
const PASSWORD_SESSION_VALUE = 'authenticated';

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
  if (!value) throw new Error(`${name} must be configured in the Vercel project environment.`);
  return value;
}

function sign(value: string): string {
  return createHmac('sha256', getEnv('SESSION_SECRET')).update(value).digest('base64url');
}

function signedSessionValue(value = SESSION_VALUE): string {
  return `s:${value}.${sign(value)}`;
}

function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const cookieHeader = Array.isArray(header) ? header.join(';') : header ?? '';
  return Object.fromEntries(cookieHeader.split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    const key = part.slice(0, separator).trim();
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return key ? [[key, value]] : [];
  }));
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
  if ((unsignedValue !== SESSION_VALUE && unsignedValue !== PASSWORD_SESSION_VALUE) || !signature) return false;
  return safeEqual(signature, sign(unsignedValue));
}

function sendJson(res: ResponseLike, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function setCookie(res: ResponseLike, name: string, value: string, maxAge: number): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAuthorizedStaffEmail(email: string): boolean {
  return STAFF_OTP_EMAILS.includes(normalizeEmail(email) as (typeof STAFF_OTP_EMAILS)[number]);
}

function isValidPassword(password: string): boolean {
  const configured = process.env.MANAGE_PASSWORD;
  return Boolean(configured && password && safeEqual(password, configured));
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = getEnv('RESEND_API_KEY');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Mixology PRO <staff@mixology.monster>',
      to: [email],
      subject: 'Mixology PRO verification code',
      text: [
        'Mixology PRO staff verification',
        '',
        `Your verification code is ${code}.`,
        '',
        'This code expires in 10 minutes and can only be used once.',
        'If you did not request this code, you can ignore this email.',
      ].join('\\n'),
      html: `<!doctype html><html><body style="margin:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#171717"><div style="max-width:480px;margin:24px auto;padding:24px"><div style="background:#fff;border:1px solid #deded9;border-radius:12px;padding:28px"><p style="margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#555">MIXOLOGY PRO</p><h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">Staff verification code</h1><p style="margin:0;color:#555;font-size:15px;line-height:1.6">Use the code below to sign in to the Mixology PRO staff area.</p><div style="margin:24px 0;padding:18px;text-align:center;background:#f3f3f0;border-radius:10px"><span style="font-size:32px;font-weight:700;letter-spacing:7px;color:#171717">${code}</span></div><p style="margin:0;color:#777;font-size:13px;line-height:1.6">Expires in 10 minutes. This code can only be used once.</p><p style="margin:18px 0 0;color:#999;font-size:12px;line-height:1.5">If you did not request this code, you can ignore this email.</p></div></div></body></html>`,
    }),
  });
  if (!response) throw new Error('The email provider did not return a response.');
}

export function handleSession(req: RequestLike, res: ResponseLike): void {
  const cookies = parseCookies(req.headers.cookie);
  sendJson(res, 200, { authenticated: isValidSession(cookies[SESSION_COOKIE]) });
}

export async function handleLogin(req: RequestLike, res: ResponseLike): Promise<void> {
  const body = readBody(req.body);
  const action = body.action === 'verify' || body.action === 'password' ? body.action : 'send';
  const cookies = parseCookies(req.headers.cookie);

  if (action === 'password') {
    const password = typeof body.password === 'string' ? body.password : '';
    if (!isValidPassword(password)) {
      sendJson(res, 401, { message: 'The password is incorrect.' });
      return;
    }
    setCookie(res, SESSION_COOKIE, signedSessionValue(), SESSION_MAX_AGE);
    sendJson(res, 200, { authenticated: true, method: 'password' });
    return;
  }

  if (action === 'send') {
    const requestedEmail = typeof body.email === 'string' ? normalizeEmail(body.email) : DEFAULT_STAFF_OTP_EMAIL;
    if (!isAuthorizedStaffEmail(requestedEmail)) {
      sendJson(res, 403, { message: 'That email is not authorized for Mixology PRO staff access.' });
      return;
    }
    const email = requestedEmail;
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

  const requestedEmail = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const otp = readOtpToken(cookies[OTP_COOKIE]);

  if (!requestedEmail || !isAuthorizedStaffEmail(requestedEmail) || !otp || otp.email !== requestedEmail || !/^\d{6}$/.test(code) || !safeEqual(otp.code, code)) {
    clearCookie(res, OTP_COOKIE);
    sendJson(res, 401, { message: 'That verification code is invalid or expired.' });
    return;
  }

  clearCookie(res, OTP_COOKIE);
  setCookie(res, SESSION_COOKIE, signedSessionValue(), SESSION_MAX_AGE);
  sendJson(res, 200, { authenticated: true });
}

export function handleLogout(_req: RequestLike, res: ResponseLike): void {
  // A response can carry multiple Set-Cookie headers. Calling setHeader twice
  // replaces the first one, so clear both auth cookies in a single header array.
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure,
    OTP_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure,
  ]);
  sendJson(res, 200, { authenticated: false });
}
