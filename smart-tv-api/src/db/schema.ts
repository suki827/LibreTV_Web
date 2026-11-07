import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const serviceMeta = sqliteTable('service_meta', {
  key: text('key').primaryKey(), value: text('value').notNull(),
});
