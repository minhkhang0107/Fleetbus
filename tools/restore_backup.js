/**
 * Restores a backup made by the server (source/server/core/backup.js) into a data folder.
 * Usage, with the server stopped: node tools/restore_backup.js <backup folder> [data folder]
 * The data folder defaults to FLEETBUS_DATA_DIR, else ./data. The same FLEETBUS_DB_KEY must be set to start after.
 */
import path from 'path';
import { TenantDatabases } from '../source/server/core/tenantDb.js';
import { restoreBackup } from '../source/server/core/backup.js';

const [folder, dataDir = process.env.FLEETBUS_DATA_DIR || 'data'] = process.argv.slice(2);
if (!folder) {
  console.error('Cách dùng: node tools/restore_backup.js <thư mục sao lưu> [thư mục dữ liệu]');
  process.exit(1);
}
try {
  const { restored, aside } = restoreBackup(path.resolve(folder), new TenantDatabases({ dataDir: path.resolve(dataDir) }));
  console.log(`Đã khôi phục ${restored.length} cơ sở dữ liệu. Bản cũ được giữ ở ${aside}`);
} catch (err) {
  console.error(`Khôi phục thất bại: ${err.message}`);
  process.exit(1);
}
