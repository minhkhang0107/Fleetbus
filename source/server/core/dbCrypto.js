/**
 * Encryption at rest of the stored records (D127).
 *
 * - One master key (32 bytes): FLEETBUS_DB_KEY (base64). Production refuses to start without it. Outside
 *   production a key is generated once into `<dataDir>/.db-key` (mode 0600); in-memory databases get a
 *   throwaway key.
 * - Each database derives its own key with HKDF from the master key and its scope (operator id or
 *   "platform"), so a record copied into another company's file does not decrypt there.
 * - A record is sealed with AES-256-GCM; the collection and the hashed record id are the additional data,
 *   so swapping rows inside a file is detected too. Record ids are stored as HMAC, never in clear
 *   (they may be phone numbers or session tokens).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class DbKeyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const KEY_BYTES = 32;

/** The master key: from the environment, else a local key file (dev), else a throwaway key (memory). */
export function loadMasterKey({ dataDir, production, env = process.env }) {
  if (env.FLEETBUS_DB_KEY) {
    const key = Buffer.from(env.FLEETBUS_DB_KEY, 'base64');
    if (key.length !== KEY_BYTES) throw new DbKeyError('DB_KEY_INVALID', 'FLEETBUS_DB_KEY phải là 32 byte mã hóa base64');
    return key;
  }
  if (production) throw new DbKeyError('DB_KEY_REQUIRED', 'Production cần FLEETBUS_DB_KEY (32 byte base64) để mã hóa dữ liệu');
  if (!dataDir) return crypto.randomBytes(KEY_BYTES);
  const file = path.join(dataDir, '.db-key');
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(KEY_BYTES);
  fs.writeFileSync(file, key.toString('base64'), { mode: 0o600, flag: 'wx' });
  return key;
}

/** Keys of one database: `enc` seals records, `mac` hashes record ids. */
export function scopeKeys(masterKey, scope) {
  const derive = (purpose) => Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.from('fleetbus-db-v1'), Buffer.from(`${purpose}:${scope}`), KEY_BYTES));
  return { enc: derive('enc'), mac: derive('mac') };
}

export function hashId(keys, collection, id) {
  return crypto.createHmac('sha256', keys.mac).update(`${collection}\0${id}`).digest('hex');
}

/** iv (12) | tag (16) | ciphertext */
export function seal(keys, collection, idHash, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.enc, iv);
  cipher.setAAD(Buffer.from(`${collection}\0${idHash}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function open(keys, collection, idHash, blob) {
  const buf = Buffer.from(blob);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keys.enc, buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${collection}\0${idHash}`));
  decipher.setAuthTag(buf.subarray(12, 28));
  try {
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    throw new DbKeyError('DB_RECORD_TAMPERED', `Bản ghi ${collection} không giải mã được: sai khóa hoặc dữ liệu đã bị sửa`);
  }
}
