import { sql } from "drizzle-orm";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { int, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
	osu_id: int().notNull().primaryKey(),
	name: text(),
	rank_standard: int(),
	total_participation: int(),
	current_daily_streak: int(),
	best_daily_streak: int(),
	is_errored: int({ mode: "boolean" }),
	last_update: text()
		.notNull()
		.default(sql`(current_timestamp)`),
});

export const daily_tracker = sqliteTable("daily_tracker", {
	osu_id: int()
		.notNull()
		.primaryKey()
		.references(() => players.osu_id),
	has_played_today: int({ mode: "boolean" }),
	full_streaker: int({ mode: "boolean" }),
	previous_daily_streak: int(),
	is_streaking: int({ mode: "boolean" }),
	last_update: text()
		.notNull()
		.default(sql`(current_timestamp)`),
});

export const admin_session = sqliteTable("admin_session", {
	id: text().notNull(),
	expires: int({ mode: "timestamp_ms" }).notNull(),
	created: int({ mode: "timestamp_ms" }).notNull(),
});
