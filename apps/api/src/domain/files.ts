/**
 * Uploaded files.
 *
 * Images are re-encoded on the way in rather than stored as received. That drops every
 * EXIF tag, and the one that matters is the GPS fix: a photo of a cat asleep on the sofa
 * carries the owner's home address, and it would otherwise travel with any copy of the
 * file. Orientation is applied before the metadata goes, so the picture stays upright.
 */

import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Database } from '../db/client';
import { files } from '../db/schema';
import { badRequest } from '../http/errors';
import { uuidv7 } from './ids';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const DOCUMENT_TYPES = ['application/pdf'];
export const ACCEPTED_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES];

export const THUMBNAIL_SIZE = 320;

export type StoredFile = typeof files.$inferSelect;

export interface UploadInput {
  householdId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
  uploadDir: string;
  now: Date;
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  // Everything image-shaped is normalised to JPEG by the re-encode below.
  return 'jpg';
}

/**
 * Detects the type from the bytes rather than trusting the declared one.
 *
 * A browser will happily send `image/jpeg` for anything; what decides how the file is
 * handled should be what is actually in it.
 */
export function sniffType(content: Buffer): string | null {
  if (content.length < 12) return null;
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    content.subarray(0, 4).toString('ascii') === 'RIFF' &&
    content.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (content.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = content.subarray(8, 12).toString('ascii');
    if (brand.startsWith('hei') || brand.startsWith('mif')) return 'image/heic';
  }
  if (content.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export async function storeFile(database: Database, input: UploadInput): Promise<StoredFile> {
  const detected = sniffType(input.content);
  if (detected === null || !ACCEPTED_TYPES.includes(detected)) {
    throw badRequest('unsupported_media_type', 'only images and PDFs can be uploaded');
  }

  const id = uuidv7(input.now.getTime());
  const directory = join(input.uploadDir, input.householdId);
  const storagePath = join(directory, `${id}.${extensionFor(detected)}`);
  await mkdir(dirname(storagePath), { recursive: true });

  let bytes = input.content;
  let mimeType = detected;
  let thumbnailPath: string | null = null;

  if (IMAGE_TYPES.includes(detected)) {
    // `rotate()` with no argument bakes in the EXIF orientation; the re-encode then leaves
    // no metadata behind, GPS included.
    bytes = await sharp(input.content).rotate().jpeg({ quality: 85 }).toBuffer();
    mimeType = 'image/jpeg';

    thumbnailPath = join(directory, `${id}.thumb.jpg`);
    const thumbnail = await sharp(bytes)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    await writeFile(thumbnailPath, thumbnail);
  }

  await writeFile(storagePath, bytes);

  database.db
    .insert(files)
    .values({
      id,
      householdId: input.householdId,
      filename: input.filename.slice(0, 200),
      mimeType,
      byteSize: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      storagePath,
      thumbnailPath,
      createdAt: input.now.toISOString(),
    })
    .run();

  return database.db.select().from(files).where(eq(files.id, id)).get() as StoredFile;
}

export function findFile(database: Database, fileId: string): StoredFile | null {
  return database.db.select().from(files).where(eq(files.id, fileId)).get() ?? null;
}

/** Removes the row and both files on disk; a missing file on disk is not an error. */
export async function deleteFile(database: Database, file: StoredFile): Promise<void> {
  database.db.delete(files).where(eq(files.id, file.id)).run();
  for (const path of [file.storagePath, file.thumbnailPath]) {
    if (!path) continue;
    await unlink(path).catch(() => undefined);
  }
}
