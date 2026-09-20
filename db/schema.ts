import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const controlConfigs = sqliteTable("control_configs", {
  ownerId: text("owner_id").primaryKey(),
  body: text("body").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
