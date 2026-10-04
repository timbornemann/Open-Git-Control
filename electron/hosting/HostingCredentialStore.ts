import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { isSecureStorageAvailable } from '../main-process/secureStore';
import { registerHostingSecrets } from './hostingRedaction';
import { hasControlCharacters } from './hostingUrls';

/** Credentials never cross the main-process boundary. */
export type HostingCredential = {
  accessToken: string;
  authType?: 'token' | 'oauth';
  refreshToken?: string;
  expiresAt?: number;
  username?: string;
  email?: string;
  clientSecret?: string;
  redirectUri?: string;
};

type CredentialPayload = { version: 1; entries: Record<string, HostingCredential> };
type EncryptedPayload = { version: 1; encrypted: string };

const validCredential = (value: unknown): value is HostingCredential => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as HostingCredential;
  return (
    typeof entry.accessToken === 'string' &&
    Boolean(entry.accessToken || entry.clientSecret) &&
    entry.accessToken.length < 65536 &&
    !hasControlCharacters(entry.accessToken) &&
    (entry.authType === undefined || entry.authType === 'token' || entry.authType === 'oauth') &&
    (entry.refreshToken === undefined || (typeof entry.refreshToken === 'string' && entry.refreshToken.length < 65536)) &&
    (entry.expiresAt === undefined || Number.isFinite(entry.expiresAt)) &&
    (entry.username === undefined || (typeof entry.username === 'string' && entry.username.length < 2000)) &&
    (entry.email === undefined || (typeof entry.email === 'string' && entry.email.length < 2000)) &&
    (entry.redirectUri === undefined || (typeof entry.redirectUri === 'string' && entry.redirectUri.length < 2000)) &&
    (entry.clientSecret === undefined || (typeof entry.clientSecret === 'string' && entry.clientSecret.length < 65536))
  );
};

export class HostingCredentialStore {
  private loaded = false;
  private loadFailure = false;
  private readonly entries = new Map<string, HostingCredential>();
  private readonly persistentIds = new Set<string>();
  private readonly unregisterSecrets = new Map<string, () => void>();

  constructor(private readonly filePath: () => string = () => path.join(app.getPath('userData'), 'hosting-credentials.json')) {}

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!isSecureStorageAvailable()) return;
    try {
      const envelope = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as EncryptedPayload;
      if (envelope.version !== 1 || typeof envelope.encrypted !== 'string') throw new Error('Unsupported credential envelope.');
      const payload = JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))) as CredentialPayload;
      if (payload.version !== 1 || !payload.entries || typeof payload.entries !== 'object') throw new Error('Unsupported credential payload.');
      for (const [id, credential] of Object.entries(payload.entries)) {
        if (id && validCredential(credential)) {
          this.entries.set(id, credential);
          this.unregisterSecrets.set(id, registerHostingSecrets([credential.accessToken, credential.refreshToken, credential.clientSecret]));
          this.persistentIds.add(id);
        }
      }
    } catch {
      // Missing or OS-inaccessible credentials require a fresh login.
      this.loadFailure = fs.existsSync(this.filePath());
    }
  }

  get(connectionId: string): HostingCredential | null {
    this.load();
    const credential = this.entries.get(connectionId);
    return credential ? { ...credential } : null;
  }

  isPersisted(connectionId: string): boolean {
    this.load();
    return this.persistentIds.has(connectionId);
  }

  set(connectionId: string, credential: HostingCredential): boolean {
    this.load();
    if (!connectionId || !validCredential(credential)) throw new Error('Invalid hosting credential.');
    const previous = this.entries.get(connectionId);
    const wasPersistent = this.persistentIds.has(connectionId);
    this.entries.set(connectionId, { ...credential });
    this.unregisterSecrets.get(connectionId)?.();
    this.unregisterSecrets.set(connectionId, registerHostingSecrets([credential.accessToken, credential.refreshToken, credential.clientSecret]));
    if (!isSecureStorageAvailable() || this.loadFailure) {
      this.persistentIds.delete(connectionId);
      return false;
    }
    this.persistentIds.add(connectionId);
    try {
      this.persist();
    } catch (error) {
      this.unregisterSecrets.get(connectionId)?.();
      if (previous) this.entries.set(connectionId, previous);
      else this.entries.delete(connectionId);
      if (previous) this.unregisterSecrets.set(connectionId, registerHostingSecrets([previous.accessToken, previous.refreshToken, previous.clientSecret]));
      else this.unregisterSecrets.delete(connectionId);
      if (!wasPersistent) this.persistentIds.delete(connectionId);
      throw error;
    }
    return true;
  }

  remove(connectionId: string): void {
    this.load();
    this.entries.delete(connectionId);
    this.unregisterSecrets.get(connectionId)?.();
    this.unregisterSecrets.delete(connectionId);
    this.persistentIds.delete(connectionId);
    if (this.loadFailure) throw new Error('The credential store is unreadable and was preserved. The current session was cleared.');
    // Never report successful logout while an on-disk token remains usable.
    if (!isSecureStorageAvailable()) {
      if (fs.existsSync(this.filePath())) throw new Error('Encrypted credential storage is unavailable. Saved credentials could not be removed.');
      return;
    }
    this.persist();
  }

  private persist(): void {
    const entries = Object.fromEntries([...this.entries].filter(([id]) => this.persistentIds.has(id)));
    const encrypted = safeStorage.encryptString(JSON.stringify({ version: 1, entries })).toString('base64');
    writeTextFileAtomically(this.filePath(), JSON.stringify({ version: 1, encrypted }));
  }
}
