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
		const existing = await db
			.select()
			.from(daily_tracker)
			.where(eq(daily_tracker.osu_id, player.id));

		if (existing.length == 1) {
			const existingPlayer = existing[0];
			await db
				.update(daily_tracker)
				.set({
					full_streaker: existingPlayer.full_streaker,
					has_played_today: true,
					previous_daily_streak: existingPlayer.previous_daily_streak,
					is_streaking: existingPlayer.is_streaking ? true : false,
					last_update: sql`(current_timestamp)`,
				})
				.where(eq(daily_tracker.osu_id, player.id));
		}
	}
}

export {
	updatePlayersFromLeaderboardCrawl,
	getPlayersFromLeaderboardCrawlWithParser,
};
