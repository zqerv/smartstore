import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface StorageProvider {
  readonly name: string;
  upload(input: { folder: string; extension: string; data: Buffer }): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));

// Local disk storage for development and single-server deployments.
// Cloud adapters (S3, Cloudinary, ...) implement StorageProvider and are registered with registerStorageProvider.
class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  async upload({ folder, extension, data }: { folder: string; extension: string; data: Buffer }) {
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
    const key = `${safeFolder}/${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
    const target = path.join(UPLOAD_ROOT, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return { key, url: this.getUrl(key) };
  }

  async delete(key: string) {
    const target = path.resolve(UPLOAD_ROOT, key);
    if (!target.startsWith(UPLOAD_ROOT + path.sep)) return;
    await fs.rm(target, { force: true });
  }

  getUrl(key: string) {
    return `/uploads/${key}`;
  }
}

let provider: StorageProvider = new LocalStorageProvider();

export function registerStorageProvider(next: StorageProvider) {
  provider = next;
}

export function getStorageProvider(): StorageProvider {
  return provider;
}
