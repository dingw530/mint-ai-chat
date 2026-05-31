import { getDb } from '../db.js';
import { RawSettings } from '../types.js';

// 读取所有设置为键值对
export function getAll(): RawSettings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: RawSettings = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// 批量写入/更新设置，使用事务保证原子性
export function upsertAll(settings: Record<string, string>): void {
  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      upsert.run(key, value);
    }
  });
  transaction();
}
