import puppeteer from "puppeteer";
import { db } from "../database/db.js";
import { players, daily_tracker } from "../database/schema.js";
import { eq, sql } from "drizzle-orm";
import { ConsolePrefixed } from "../utils/console-prefixed.js";
const consolePref = new ConsolePrefixed("[crawlAndUpdateDailyPlayers]");

async function getPlayersFromLeaderboardCrawl() {
	const BASE_URL = "https://osu.ppy.sh";
	const TODAY = new Date();
	const DATE_URL = `${TODAY.getFullYear()}-${
		TODAY.getUTCMonth() + 1
	}-${TODAY.getUTCDate()}`;
	const ENTRY_URL = `${BASE_URL}/rankings/daily-challenge/${DATE_URL}`;

	// Setup Puppeteer browser instance
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	await page.setViewport({ width: 1080, height: 1024 });
	page.setDefaultNavigationTimeout(90_000);

	const allDailyPlayers: { id: number; name: string }[] = [];

	let browsingUrl: string | null = ENTRY_URL;
	while (browsingUrl) {
		const currentBrowsingUrl: string = browsingUrl;
		let nextBrowsingUrl = null;
		consolePref.info(`Navigating ${browsingUrl}`);
		try {
			// Navigate to the specified url
			await page.goto(currentBrowsingUrl);
			// Check out interactivity before doing anything
			await page.locator(".ranking-page-table > tbody").hover();

			const playerListContainer = await page
				.locator(".ranking-page-table > tbody")
				.waitHandle();

			const playersPerPage: typeof allDailyPlayers =
				await playerListContainer.evaluate((elem) => {
					// Get data from within browser context (players)
					// then pass it onto playersPerPage
					const playerRows = elem.querySelectorAll("tr");
					const players: typeof allDailyPlayers = [];

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
						players.push({
							id: isNaN(retrievedId) ? 0 : retrievedId,
							name: retrievedName ?? "",
						});
					});
					// Pass retrieved values
					return players;
				});

			playersPerPage.forEach((player) => {
				if (player.id || player.name) {
					allDailyPlayers.push({
						id: player.id,
						name: player.name.trim(),
					});
				}
			});

			const navContainer = await page.locator("nav.pagination-v2").waitHandle();

			const detectedNextPageurl: string | null = await navContainer.evaluate(
				(elem) => {
					const nextPageLink = elem.querySelector("div:last-child > a");
					if (nextPageLink?.tagName == "A") {
						return nextPageLink.getAttribute("href") ?? null;
					} else {
						return null;
					}
				},
			);

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

	consolePref.info("Closing browser session");
	await browser.close();

	return allDailyPlayers;
}

async function updatePlayersFromLeaderboardCrawl() {
	const allDailyPlayers = await getPlayersFromLeaderboardCrawl();

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

export { getPlayersFromLeaderboardCrawl, updatePlayersFromLeaderboardCrawl };
