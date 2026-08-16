import { db } from "../database/db.js";
import { players, daily_tracker } from "../database/schema.js";
import { eq, sql } from "drizzle-orm";
import { ConsolePrefixed } from "../utils/console-prefixed.js";
const consolePref = new ConsolePrefixed("[crawlAndUpdateDailyPlayers]");
import { parse as htmlParse } from "node-html-parser";
import { sleep } from "../utils/sleep.js";

async function getPlayersFromLeaderboardCrawlWithParser() {
	const BASE_URL = "https://osu.ppy.sh";
	const TODAY = new Date();
	const DATE_URL = `${TODAY.getUTCFullYear()}-${
		TODAY.getUTCMonth() + 1
	}-${TODAY.getUTCDate()}`;
	const ENTRY_URL = `${BASE_URL}/rankings/daily-challenge/${DATE_URL}`;

	const allDailyPlayers: { id: number; name: string }[] = [];

	let browsingUrl: string | null = ENTRY_URL;

	while (browsingUrl) {
		const currentBrowsingUrl: string = browsingUrl;
		let nextBrowsingUrl = null;
		consolePref.info(`Navigating ${browsingUrl}`);
		await sleep(3_000);
		try {
			// Navigate to the specified url
			const pageFetcher = await fetch(currentBrowsingUrl);
			const pageRaw = await pageFetcher.text();
			const page = htmlParse(pageRaw);

			const playerListContainer = page.querySelector(
				".ranking-page-table > tbody",
			);

			const playersPerPage: typeof allDailyPlayers = [];

			if (!playerListContainer) {
				throw new Error("Player list not detected");
			}

			// Get data by querying inside the container
			const playerRows = playerListContainer.querySelectorAll("tr");

			playerRows.forEach((row) => {
				// Try to get player id & name
				const retrievedId = parseInt(
					row
						.querySelector(".ranking-page-table-main__link.js-usercard")
						?.getAttribute("data-user-id") ?? "",
				);
				const retrievedName = row.querySelector(
					".ranking-page-table-main__link.js-usercard > span",
				)?.textContent;

				// Push values with their correct types
				playersPerPage.push({
					id: isNaN(retrievedId) ? 0 : retrievedId,
					name: retrievedName ?? "",
				});
			});

			playersPerPage.forEach((player) => {
				if (player.id || player.name) {
					allDailyPlayers.push({
						id: player.id,
						name: player.name.trim(),
					});
				}
			});

			const navContainer = page.querySelector("nav.pagination-v2");
			let detectedNextPageurl: string | null = null;

			if (navContainer) {
				const nextPageLink = navContainer.querySelector("div:last-child > a");
				if (nextPageLink?.tagName == "A") {
					detectedNextPageurl = nextPageLink.getAttribute("href") ?? null;
				}
			}

			if (typeof detectedNextPageurl == "string") {
				nextBrowsingUrl = detectedNextPageurl;
			}
		} catch (error) {
			consolePref.error(error);
			nextBrowsingUrl = null;
		} finally {
			if (typeof nextBrowsingUrl == "string") {
				if (currentBrowsingUrl == nextBrowsingUrl) {
					consolePref.error("Looping detected");
					browsingUrl = null;
				} else {
					browsingUrl = nextBrowsingUrl;
				}
			} else {
				consolePref.info("End of navigation");
				browsingUrl = null;
			}
		}
	}

	consolePref.info("End of crawling session");

	return allDailyPlayers;
}

async function updatePlayersFromLeaderboardCrawl() {
	const allDailyPlayers = await getPlayersFromLeaderboardCrawlWithParser();

	for (let i = 0; i < allDailyPlayers.length; i++) {
		const player = allDailyPlayers[i];
		const existingTrackerArray = await db
			.select()
			.from(daily_tracker)
			.where(eq(daily_tracker.osu_id, player.id));

		const existingPlayerArray = await db
			.select()
			.from(players)
			.where(eq(players.osu_id, player.id));

		// Please note that this is only an attempt to sync
		// player stats based on initial states that were
		// provided by the API fetcher.
		// You should NOT run this BEFORE the API fetcher
		// did its tasks first. If the fetcher runs at 1 UTC,
		// schedule this script at 1:30 UTC.
		if (existingTrackerArray.length == 1 && existingPlayerArray.length == 1) {
			const existingTracker = existingTrackerArray[0];
			const existingPlayer = existingPlayerArray[0];

			// Do not update errored players
			// They potentially contain outdated information
			if (existingPlayer.is_errored === true) {
				continue;
			}

			// Do not update if it's new day
			// We need to convert everything into UTC at 00:00
			// To make day calculation possible
			const lastUpdate: Date = (() => {
				const last = new Date(existingTracker.last_update + "+00");
				return new Date(
					Date.UTC(
						last.getUTCFullYear(),
						last.getUTCMonth(),
						last.getUTCDate(),
					),
				);
			})();
			const today: Date = (() => {
				const now = new Date();
				return new Date(
					Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
				);
			})();

			const timeSinceLastUpdate = today.getTime() - lastUpdate.getTime();
			const daySinceLastUpdate = timeSinceLastUpdate / 86400000;

			if (daySinceLastUpdate > 0) {
				continue;
			}

			if (existingTracker.has_played_today == false) {
				await db
					.update(daily_tracker)
					.set({
						full_streaker: existingTracker.full_streaker,
						has_played_today: true,
						previous_daily_streak:
							typeof existingPlayer.current_daily_streak == "number"
								? existingPlayer.current_daily_streak
								: existingTracker.previous_daily_streak,
						is_streaking: existingTracker.is_streaking ? true : false,
						last_update: sql`(current_timestamp)`,
					})
					.where(eq(daily_tracker.osu_id, player.id));

				await db
					.update(players)
					.set({
						current_daily_streak:
							typeof existingPlayer.current_daily_streak == "number"
								? existingPlayer.current_daily_streak + 1
								: existingPlayer.current_daily_streak,
						best_daily_streak: (() => {
							let bestDailyStreak = existingPlayer.best_daily_streak;
							if (typeof existingPlayer.best_daily_streak == "number") {
								if (
									Number(existingPlayer.best_daily_streak) ===
									Number(existingPlayer.current_daily_streak)
								) {
									bestDailyStreak = existingPlayer.best_daily_streak + 1;
								}
							}
							return bestDailyStreak;
						})(),
						total_participation:
							typeof existingPlayer.total_participation == "number"
								? existingPlayer.total_participation + 1
								: existingPlayer.total_participation,
						last_update: sql`(current_timestamp)`,
					})
					.where(eq(players.osu_id, player.id));
			}
		}
	}
}

export {
	updatePlayersFromLeaderboardCrawl,
	getPlayersFromLeaderboardCrawlWithParser,
};
