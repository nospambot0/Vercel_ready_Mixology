import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { unzipSync } from 'fflate';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isValidSession } from '../manage/_auth';

type Req = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

type S3SendClient = {
  send(command: unknown): Promise<any>;
};

type Res = {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  end(body?: string): void;
};

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function cookies(header: string | string[] | undefined): Record<string, string> {
  const value = Array.isArray(header) ? header.join(';') : header ?? '';
  return Object.fromEntries(value.split(';').flatMap((part) => {
    const i = part.indexOf('=');
    if (i < 0) return [];
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    return k ? [[k, v]] : [];
  }));
}

function staff(req: Req) {
  return isValidSession(cookies(req.headers.cookie).hillview_manage_session);
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not configured in Vercel.');
  return value;
}

function client() {
  const config: S3ClientConfig = {
    region: 'auto',
    endpoint: env('R2_ENDPOINT'),
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    },
  };
  return new S3Client(config) as unknown as S3SendClient;
}

function bodyOf(req: Req): Record<string, unknown> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function cleanName(name: string) {
  const base = name.split(/[\\/]/).pop()?.trim() || 'track';
  const safe = base.replace(/[^a-zA-Z0-9._()\- ]+/g, '_').replace(/\s+/g, ' ').slice(0, 150);
  return safe || 'track';
}

function keyFromQuery(req: Req) {
  const raw = req.query?.key;
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key || !key.startsWith('music/')) return '';
  return key;
}

export default async function handler(req: Req, res: Res) {
  if (!staff(req)) {
    json(res, 401, { message: 'Staff authentication required.' });
    return;
  }

  const bucket = env('R2_BUCKET_NAME');
  const s3 = client();

  try {
    if (req.method === 'GET') {
      const listed = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'music/',
        MaxKeys: 500,
      }));

      const items = await Promise.all((listed.Contents ?? [])
        .filter((item: { Key?: string; Size?: number }) => item.Key && item.Size)
        .sort((a: { Key?: string }, b: { Key?: string }) => String(a.Key).localeCompare(String(b.Key)))
        .map(async (item: { Key?: string; Size?: number; LastModified?: Date }) => ({
          key: item.Key!,
          name: item.Key!.replace(/^music\//, ''),
          size: item.Size ?? 0,
          updatedAt: item.LastModified?.toISOString() ?? null,
          url: await getSignedUrl(s3, new GetObjectCommand({
            Bucket: bucket,
            Key: item.Key!,
            ResponseContentType: 'audio/mpeg',
          }), { expiresIn: 3600 }),
        })));

      json(res, 200, { items });
      return;
    }

    if (req.method === 'POST') {
      const body = bodyOf(req);
      const action = typeof body.action === 'string' ? body.action : '';

      if (action === 'import-zip') {
        const listed = await s3.send(new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 500,
        }));
        const zips = (listed.Contents ?? [])
          .filter((item: { Key?: string }) => item.Key && item.Key.toLowerCase().endsWith('.zip'))
          .sort((a: { LastModified?: Date }, b: { LastModified?: Date }) =>
            Number(b.LastModified ?? 0) - Number(a.LastModified ?? 0));
        if (!zips.length) {
          json(res, 404, { message: 'No ZIP archive found in the KARMADJ R2 bucket.' });
          return;
        }
        if (zips.length > 1 && typeof body.key !== 'string') {
          json(res, 409, {
            message: 'Multiple ZIP archives found. Supply the ZIP key to import.',
            archives: zips.map((x: { Key?: string; Size?: number; LastModified?: Date }) => ({
              key: x.Key, size: x.Size ?? 0, updatedAt: x.LastModified?.toISOString() ?? null
            }))
          });
          return;
        }
        const requestedKey = typeof body.key === 'string' ? body.key.trim() : zips[0].Key!;
        if (!requestedKey || !requestedKey.toLowerCase().endsWith('.zip') || requestedKey.includes('..')) {
          json(res, 400, { message: 'Invalid ZIP key.' });
          return;
        }
        const zipObject = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: requestedKey }));
        const bytes = zipObject.Body && typeof zipObject.Body.transformToByteArray === 'function'
          ? await zipObject.Body.transformToByteArray()
          : new Uint8Array(await new Response(zipObject.Body as any).arrayBuffer());
        const files = unzipSync(bytes);
        const audioExt = /\.(mp3|m4a|aac|wav|ogg|oga|flac|webm)$/i;
        const archiveName = requestedKey.split('/').pop()?.replace(/\.zip$/i, '') || 'Imported Pack';
        let imported = 0;
        for (const [name, data] of Object.entries(files)) {
          if (!audioExt.test(name) || name.endsWith('/')) continue;
          const filename = cleanName(name);
          const ext = filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '.mp3';
          const contentType = ext === '.mp3' ? 'audio/mpeg'
            : ext === '.wav' ? 'audio/wav'
            : ext === '.ogg' || ext === '.oga' ? 'audio/ogg'
            : ext === '.webm' ? 'audio/webm'
            : ext === '.flac' ? 'audio/flac'
            : ext === '.aac' ? 'audio/aac'
            : 'audio/mp4';
          const key = `music/${cleanName(archiveName)}/${filename}`;
          await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
          }));
          imported++;
        }
        json(res, 200, { imported, archive: requestedKey });
        return;
      }

      if (action !== 'presign-upload') {
        json(res, 400, { message: 'Unknown action.' });
        return;
      }

      const filename = typeof body.filename === 'string' ? cleanName(body.filename) : 'track';
      const requestedType = typeof body.contentType === 'string' ? body.contentType : '';
      const isZip = requestedType === 'application/zip' || filename.toLowerCase().endsWith('.zip');
      const contentType = isZip ? 'application/zip' : requestedType.startsWith('audio/') ? requestedType : 'audio/mpeg';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const prefix = isZip ? 'imports/' : 'music/';
      const key = `${prefix}${stamp}-${crypto.randomUUID()}-${filename}`;

      const url = await getSignedUrl(s3, new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }), {
        expiresIn: 900,
        signableHeaders: new Set(['content-type']),
      });

      json(res, 200, { key, url });
      return;
    }

    if (req.method === 'DELETE') {
      const key = keyFromQuery(req);
      if (!key) {
        json(res, 400, { message: 'A valid music key is required.' });
        return;
      }
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      json(res, 200, { deleted: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    json(res, 405, { message: 'Method not allowed.' });
  } catch (error) {
    console.error('KARMADJ R2 error', error);
    json(res, 500, { message: error instanceof Error ? error.message : 'R2 operation failed.' });
  }
}
