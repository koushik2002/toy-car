import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import sharp from 'sharp';
import type { ServerConfig } from '../config.js';
import { requireIdentityRole } from '../identity/routes.js';

const params = {
  type: 'object',
  required: ['id', 'slot'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    slot: { type: 'integer', minimum: 1, maximum: 5 },
  },
} as const;
function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}
export async function registerMediaRoutes(app: FastifyInstance, pool: Pool, config: ServerConfig) {
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 1 },
    throwFileSizeLimit: true,
  });
  const storage =
    config.r2Endpoint &&
    config.r2AccessKeyId &&
    config.r2SecretAccessKey &&
    config.r2Bucket &&
    config.mediaPublicBaseUrl
      ? new S3Client({
          endpoint: config.r2Endpoint,
          region: 'auto',
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.r2AccessKeyId,
            secretAccessKey: config.r2SecretAccessKey,
          },
        })
      : null;
  app.put<{ Params: { id: string; slot: number } }>(
    '/api/admin/products/:id/images/:slot',
    {
      schema: { tags: ['Admin catalogue'], params, consumes: ['multipart/form-data'] },
    },
    async (request, reply) => {
      const auth = {
        emailPasswordEnabled: true,
        production: config.production,
        allowedOrigins: config.allowedOrigins,
        publicWebUrl: config.publicWebUrl,
        outboxEncryptionKey: config.outboxEncryptionKey,
      };
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      if (!storage)
        return fail(reply, 503, 'MEDIA_NOT_CONFIGURED', 'Product image storage is not configured.');
      const exists = await pool.query('SELECT id FROM catalogue_products WHERE id=$1', [
        request.params.id,
      ]);
      if (!exists.rowCount) return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      let file;
      try {
        file = await request.file();
      } catch {
        return fail(reply, 400, 'INVALID_IMAGE', 'Upload one image under 10 MB.');
      }
      if (!file || file.fieldname !== 'image')
        return fail(reply, 400, 'INVALID_IMAGE', 'Choose an image file.');
      let bytes: Buffer;
      try {
        bytes = await file.toBuffer();
      } catch {
        return fail(reply, 400, 'INVALID_IMAGE', 'Upload one image under 10 MB.');
      }
      if (bytes.length > 10 * 1024 * 1024)
        return fail(reply, 400, 'INVALID_IMAGE', 'Image is too large.');
      let output: Buffer;
      try {
        const info = await sharp(bytes, {
          limitInputPixels: 40_000_000,
          failOn: 'error',
        }).metadata();
        if (
          !['jpeg', 'png', 'webp', 'avif', 'heif'].includes(info.format || '') ||
          !info.width ||
          !info.height ||
          info.width < 300 ||
          info.height < 300
        )
          return fail(
            reply,
            400,
            'INVALID_IMAGE',
            'Use a clear JPG, PNG, WebP, AVIF or HEIF image at least 300 pixels wide and tall.',
          );
        output = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        return fail(reply, 400, 'INVALID_IMAGE', 'This image could not be processed.');
      }
      const key = `products/${request.params.id}/${request.params.slot}/${randomUUID()}.webp`;
      const url = `${config.mediaPublicBaseUrl!.replace(/\/$/, '')}/${key}`;
      await storage.send(
        new PutObjectCommand({
          Bucket: config.r2Bucket,
          Key: key,
          Body: output,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      const client = await pool.connect();
      let oldKey: string | null;
      try {
        await client.query('BEGIN');
        const before = await client.query<{ object_key: string | null }>(
          'SELECT object_key FROM catalogue_product_images WHERE product_id=$1 AND slot=$2 FOR UPDATE',
          [request.params.id, request.params.slot],
        );
        oldKey = before.rows[0]?.object_key || null;
        await client.query(
          `INSERT INTO catalogue_product_images(product_id,slot,url,alt,object_key)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,slot) DO UPDATE
        SET url=excluded.url,alt=excluded.alt,object_key=excluded.object_key`,
          [
            request.params.id,
            request.params.slot,
            url,
            `${file.filename || 'Toy car'} view ${request.params.slot}`,
            key,
          ],
        );
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
        VALUES($1,$2,'product.image_uploaded',$3,$4)`,
          [randomUUID(), session.user.id, request.params.id, request.id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        try {
          await storage.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key }));
        } catch {
          /* Retained for storage cleanup. */
        }
        throw error;
      } finally {
        client.release();
      }
      if (oldKey) {
        try {
          await storage.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: oldKey }));
        } catch {
          request.log.warn({ key: oldKey }, 'Could not remove replaced image');
        }
      }
      return reply.code(201).send({ image: { slot: Number(request.params.slot), url } });
    },
  );
  app.addHook('onClose', async () => {
    storage?.destroy();
  });
}
