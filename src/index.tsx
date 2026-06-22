import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { trimTrailingSlash } from "hono/trailing-slash";
import {
	deleteCookie,
	getCookie,
	getSignedCookie,
	setCookie,
	setSignedCookie,
	generateCookie,
	generateSignedCookie,
} from "hono/cookie";
import { Cache } from "./utils/cache.js";

import { OsuAPI } from "./osu-api.js";
import { updateAllTrackedPlayers } from "./tools/update-players.js";
import { updatePlayersFromLeaderboardCrawl } from "./tools/crawl-daily-update.js";
import { UtcAlarmManager } from "./utils/alarm.js";
import { db } from "./database/db.js";
import { players, daily_tracker } from "./database/schema.js";
import { eq, sql, not } from "drizzle-orm";
import { assertString } from "./utils/assert.js";
import { admin_session } from "./database/schema.js";
import { adminSessionCleanup } from "./tools/admin-session-cleanup.js";
import {
	queueAddTrackedPlayers,
	getQueueStatus,
} from "./tools/add-tracked-players.js";
import { jsxRenderer } from "hono/jsx-renderer";
import { MainPage } from "./components/main-page.js";
import { getDailyStreakers } from "./tools/get-daily-streakers.js";

const PORT = parseInt(`${process.env.SERVER_PORT}`);
if (isNaN(PORT)) {
	throw new Error("Please enter server port correctly!");
}

const ADMIN_USERNAME = assertString(process.env.ADMIN_USERNAME);
const ADMIN_PASSWORD = assertString(process.env.ADMIN_PASSWORD);

const app = new Hono();

app.use("*", trimTrailingSlash());

app.get("/login", (c) => {
	return c.redirect("./login/");
});

app.get("/manage", (c) => {
	return c.redirect("./manage/");
});

app.use("/manage/*", async (c, next) => {
	try {
		const cookie = getCookie(c);
		const sessionValidity = await checkUuidValidity(cookie?.uuid);

		if (!sessionValidity) {
			return c.redirect("../login/");
		}

		const maxAge = await extendUuidSession(cookie?.uuid);
		if (maxAge) {
			c.header(
				"Set-Cookie",
				`uuid=${cookie?.uuid}; Max-Age=${maxAge}; path=/; SameSite=Strict; Secure; HttpOnly`,
			);
		}

		await next();
	} catch (error) {
		console.error(error);
		c.status(500);
		return c.text("Internal Server Error");
	}
});

async function extendUuidSession(clientUuid?: unknown): Promise<number> {
	try {
		if (!clientUuid || typeof clientUuid != "string") {
			return 0;
		}

		const existingUuid = await db
			.select()
			.from(admin_session)
			.where(eq(admin_session.id, clientUuid));

		if (existingUuid.length < 1) {
			return 0;
		}

		const currentTime = new Date();
		const maxAge = 30 * 60;
		const expiryTime = new Date(currentTime.getTime() + maxAge * 1000);

		const dbSession = await db
			.update(admin_session)
			.set({ expires: expiryTime })
			.where(eq(admin_session.id, existingUuid[0].id));

		if (dbSession.changes < 1) {
			throw new Error("Failed to update uuid expiry time to database");
		}

		return maxAge;
	} catch (error) {
		console.error(error);
		return 0;
	}
}

async function checkUuidValidity(clientUuid?: unknown): Promise<boolean> {
	if (!clientUuid || typeof clientUuid != "string") {
		return false;
	}

	const existingUuid = await db
		.select()
		.from(admin_session)
		.where(eq(admin_session.id, clientUuid));

	if (existingUuid.length < 1) {
		return false;
	}

	const currentTime = new Date();

	if (currentTime.getTime() >= existingUuid[0].expires.getTime()) {
		return false;
	}

	return true;
}

app.use(
	"*",
	jsxRenderer(({ children }) => {
		return <>{children}</>;
	}),
);

app.get("/", async (c) => {
	return c.render(<MainPage queries={c.req.query()} />);
});

app.get(
	"/*",
	serveStatic({
		root: "./pages/",
	}),
);

app.get("/api", (c) => {
	return c.text("Nope, not here.");
});

app.post("/api/auth", async (c) => {
	try {
		const data = await c.req.json();

		const signInValidity =
			data?.username == ADMIN_USERNAME && data?.password == ADMIN_PASSWORD;

		if (!signInValidity) {
			c.status(401);
			return c.json({
				error: true,
				message: "Invalid username and/or password",
			});
		}

		const uuid = crypto.randomUUID();
		const currentTime = new Date();
		const maxAge = 30 * 60;
		const expiryTime = new Date(currentTime.getTime() + maxAge * 1000);

		const dbSession = await db.insert(admin_session).values({
			id: uuid,
			expires: expiryTime,
			created: currentTime,
		});

		if (dbSession.changes < 1) {
			throw new Error("Failed to insert uuid to database");
		}

		c.status(200);
		c.header(
			"Set-Cookie",
			`uuid=${uuid}; Max-Age=${maxAge}; path=/; SameSite=Strict; Secure; HttpOnly`,
		);
		return c.json({
			success: true,
			message: "Successful login",
		});
	} catch (error) {
		console.error(error);
		c.status(500);
		return c.json({
			success: false,
			message: "Internal Server Error",
		});
	}
});

app.use("/api/manage/*", async (c, next) => {
	try {
		const cookie = getCookie(c);
		const sessionValidity = await checkUuidValidity(cookie?.uuid);

		if (!sessionValidity) {
			c.status(401);
			return c.json({
				success: false,
				message: "You're not authenticated, please login.",
			});
		}

		const maxAge = await extendUuidSession(cookie?.uuid);
		if (maxAge) {
			c.header(
				"Set-Cookie",
				`uuid=${cookie?.uuid}; Max-Age=${maxAge}; path=/; SameSite=Strict; Secure; HttpOnly`,
			);
		}

		await next();
	} catch (error) {
		console.error(error);
		c.status(500);
		return c.json({
			success: false,
			message: "Internal Server Error",
		});
	}
});

app.post("/api/manage/add-tracked-players", async (c) => {
	try {
		const data = await c.req.json();

		const players = data?.players;

		if (!Array.isArray(players)) {
			c.status(400);
			return c.json({
				success: false,
				message: "Players array not found",
			});
		}

		queueAddTrackedPlayers(players);

		return c.json({
			success: true,
			message: "Adding username(s) to tracked players… this might take a while",
		});
	} catch (error) {
		console.error(error);
		c.status(500);
		return c.json({
			success: false,
			message: "Internal Server Error",
		});
	}
});

app.get("/api/manage/add-tracked-players/queue-status", async (c) => {
	const { queue, processing } = getQueueStatus();
	return c.json({
		success: true,
		message: "-",
		data: {
			queue: queue.join(", "),
			processing: processing,
		},
	});
});

app.post("/api/manage/remove-tracked-players", async (c) => {
	try {
		const data = await c.req.json();

		const playersId = data?.players_id;

		if (!Array.isArray(playersId)) {
			c.status(400);
			return c.json({
				success: false,
				message: "Players ID array not found",
			});
		}

		let removed: number[] = [];
		let errored: number[] = [];

		for (let i = 0; i < playersId.length; i++) {
			const playerId = playersId[i];

			if (typeof playerId != "number") {
				continue;
			}

			try {
				console.log(`Deleting ${playerId}`);
				await db
					.delete(daily_tracker)
					.where(eq(daily_tracker.osu_id, playerId));

				await db.delete(players).where(eq(players.osu_id, playerId));
			} catch (error) {
				console.error(error);
				errored.push(playerId);
				continue;
			}

			removed.push(playerId);
		}

		if (errored.length > 0) {
			c.status(500);
			return c.json({
				success: false,
				message:
					"There was an error that caused partial removal of specified player(s)",
				data: {
					removed: removed,
					errored: errored,
				},
			});
		}

		return c.json({
			success: true,
			message: "Successfully removed specified player(s)",
			data: {
				removed: removed,
			},
		});
	} catch (error) {
		console.error(error);
		c.status(500);
		return c.json({
			success: false,
			message: "Internal Server Error",
		});
	}
});

app.get("/api/manage/tracked-players", async (c) => {
	const trackedPlayers = await db
		.select({ osu_id: players.osu_id, name: players.name })
		.from(players);

	return c.json({
		success: true,
		message: "-",
		data: {
			players: trackedPlayers,
		},
	});
});

app.get("/api/my-rank", async (c) => {
	const myRank = await OsuAPI.getMyUserRank();
	return c.text(`My osu rank is ${myRank}`);
});

app.get("/api/daily-streakers", async (c) => {
	const cacheName = "daily-streakers";
	const existingCache = Cache.get(cacheName);

	if (existingCache) {
		return c.json(existingCache);
	}

	const data = await getDailyStreakers();

	Cache.set(cacheName, data);
	return c.json(data);
});

serve(
	{
		fetch: app.fetch,
		port: PORT,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);

const updatePlayersTimes: [number, number][] = [];
updatePlayersTimes.push([0, 10]);
updatePlayersTimes.push([0, 40]);
for (let i = 1; i <= 23; i++) {
	updatePlayersTimes.push([i, 1]);
	updatePlayersTimes.push([i, 35]);
}

UtcAlarmManager.add({
	name: "Update Tracked Players",
	callback: updateAllTrackedPlayers,
	time: updatePlayersTimes,
});

UtcAlarmManager.add({
	name: "Crawler",
	callback: updatePlayersFromLeaderboardCrawl,
	time: [
		[23, 15],
		[23, 45],
	],
});

const adminSessionCleaningTimes: [number, number][] = [];
for (let i = 1; i <= 23; i++) {
	adminSessionCleaningTimes.push([i, 0]);
	adminSessionCleaningTimes.push([i, 30]);
}

UtcAlarmManager.add({
	name: "Auth Cleanup",
	callback: adminSessionCleanup,
	time: adminSessionCleaningTimes,
});
