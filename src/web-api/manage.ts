import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { checkUuidValidity, extendUuidSession } from "./auth.js";
import { db } from "../database/db.js";
import { players, daily_tracker } from "../database/schema.js";
import { eq } from "drizzle-orm";
import {
	queueAddTrackedPlayers,
	getQueueStatus,
} from "../tools/add-tracked-players.js";

// ======= Management page middleware =======

const managePageMiddleware = new Hono();

managePageMiddleware.get("/manage", (c) => {
	return c.redirect("./manage/");
});

managePageMiddleware.use("/manage/*", async (c, next) => {
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

// ======= Management api =======

const manageApi = new Hono().basePath("/api/manage");

// Middleware for all /api/manage/*
manageApi.use("/*", async (c, next) => {
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

manageApi.post("/add-tracked-players", async (c) => {
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

manageApi.get("/add-tracked-players/queue-status", async (c) => {
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

manageApi.post("/remove-tracked-players", async (c) => {
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

manageApi.get("/tracked-players", async (c) => {
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

export { managePageMiddleware, manageApi };
