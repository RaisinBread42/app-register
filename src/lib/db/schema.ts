import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => people.id),
  backupOwnerId: text('backup_owner_id')
    .notNull()
    .references(() => people.id),
  renewalDate: text('renewal_date'),
  noticeDeadline: text('notice_deadline'),
  billingCycle: text('billing_cycle'),
  costCents: integer('cost_cents'),
  runtimeLocation: text('runtime_location'),
  dataAndKeys: text('data_and_keys'),
  whatBreaksIfStopped: text('what_breaks_if_stopped'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type PersonRow = typeof people.$inferSelect;
export type AppRow = typeof apps.$inferSelect;
