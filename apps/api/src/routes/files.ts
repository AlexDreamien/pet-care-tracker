import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertWritable, resolveHousehold } from '../domain/access';
import { membershipRole } from '../domain/auth';
import { deleteFile, findFile, storeFile } from '../domain/files';
import { type AppContext, requireAuth } from '../http/context';
import { badRequest, notFound } from '../http/errors';

const uploadQuery = z.object({ householdId: z.uuid().optional() });

export function registerFileRoutes(app: FastifyInstance, context: AppContext): void {
  app.post('/files', async (request, reply) => {
    const { user } = requireAuth(request);
    const query = uploadQuery.parse(request.query);
    const access = assertWritable(resolveHousehold(context.database, user.id, query.householdId));

    const upload = await request.file({ limits: { fileSize: context.config.MAX_UPLOAD_BYTES } });
    if (!upload) throw badRequest('validation_failed', 'no file was sent');

    const content = await upload.toBuffer();
    if (upload.file.truncated) {
      throw badRequest('payload_too_large', 'the upload is too large');
    }

    const stored = await storeFile(context.database, {
      householdId: access.householdId,
      filename: upload.filename,
      mimeType: upload.mimetype,
      content,
      uploadDir: context.config.UPLOAD_DIR,
      now: context.now(),
    });

    return reply.status(201).send({
      file: {
        id: stored.id,
        filename: stored.filename,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        hasThumbnail: stored.thumbnailPath !== null,
      },
    });
  });

  const serve = async (
    request: { params: { id: string } },
    userId: string,
    variant: 'full' | 'thumb',
  ) => {
    const file = findFile(context.database, request.params.id);
    if (!file) throw notFound('file');
    if (membershipRole(context.database, { userId, householdId: file.householdId }) === null) {
      throw notFound('file');
    }

    const path = variant === 'thumb' ? file.thumbnailPath : file.storagePath;
    if (!path) throw notFound('thumbnail');
    // The row can outlive the bytes if a volume was restored from an older snapshot.
    const exists = await stat(path).catch(() => null);
    if (!exists) throw notFound('file contents');

    return { file, path, size: exists.size };
  };

  app.get<{ Params: { id: string } }>('/files/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    const { file, path, size } = await serve(request, user.id, 'full');

    return (
      reply
        .header('content-type', file.mimeType)
        .header('content-length', size)
        // Content is immutable per id, and it is nobody else's business but the member's.
        .header('cache-control', 'private, max-age=31536000, immutable')
        .send(createReadStream(path))
    );
  });

  app.get<{ Params: { id: string } }>('/files/:id/thumb', async (request, reply) => {
    const { user } = requireAuth(request);
    const { path, size } = await serve(request, user.id, 'thumb');

    return reply
      .header('content-type', 'image/jpeg')
      .header('content-length', size)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(createReadStream(path));
  });

  app.delete<{ Params: { id: string } }>('/files/:id', async (request) => {
    const { user } = requireAuth(request);
    const file = findFile(context.database, request.params.id);
    if (!file) throw notFound('file');

    const role = membershipRole(context.database, {
      userId: user.id,
      householdId: file.householdId,
    });
    if (role === null) throw notFound('file');
    assertWritable({ householdId: file.householdId, role });

    await deleteFile(context.database, file);
    return { ok: true };
  });
}
