import { db } from "../database/db.js";
import { players, daily_tracker } from "../database/schema.js";
import { eq, sql, not } from "drizzle-orm";

async function getDailyStreakers() {
	const beginningDate = new Date("2024-07-25T00:00:00+00:00");
	const millisecondsSinceBeginning =
		new Date().getTime() - beginningDate.getTime();
	const daysSinceBeginning = Math.floor(millisecondsSinceBeginning / 86400000);

	const data = await db
		.select({
			osu_id: players.osu_id,
			name: players.name,
			rank_standard: players.rank_standard,
			total_participation: players.total_participation,
			tier_change: sql<number>`
				case 
					when ( 
						(${players.current_daily_streak}=0) and 
						(${daysSinceBeginning - 1}=${daily_tracker.previous_daily_streak}) and 
						(${not(daily_tracker.full_streaker)}) 
					) then -3
					when (
						(${players.current_daily_streak}=0) and 
						(${daily_tracker.previous_daily_streak}>=30) 
					) then -2
					when (
						(${players.current_daily_streak}=0) and 
						(${daily_tracker.previous_daily_streak}>=2) 
					) then -1
					when (
						(${daily_tracker.previous_daily_streak}<2) and
						(${daily_tracker.is_streaking}) 
					) then 1
					else 0
				end`,
			current_streak: players.current_daily_streak,
			best_daily_streak: players.best_daily_streak,
			previous_daily_streak: daily_tracker.previous_daily_streak,
			has_played_today: daily_tracker.has_played_today,
			full_streaker: daily_tracker.full_streaker,
			is_streaking: daily_tracker.is_streaking,
			is_errored: players.is_errored,
			last_update: sql<string>`concat(${daily_tracker.last_update},'+00')`,
		})
		.from(players)
		.leftJoin(daily_tracker, eq(daily_tracker.osu_id, players.osu_id));

	return data;
}

export { getDailyStreakers };
