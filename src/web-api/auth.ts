import { Hono } from "hono";
import { assertString } from "../utils/assert.js";
import { db } from "../database/db.js";
import { admin_session } from "../database/schema.js";
import { eq } from "drizzle-orm";

const ADMIN_USERNAME = assertString(process.env.ADMIN_USERNAME);
const ADMIN_PASSWORD = assertString(process.env.ADMIN_PASSWORD);

const authApi = new Hono().basePath("/api/auth");

authApi.post("/", async (c) => {
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

export { authApi, checkUuidValidity, extendUuidSession };
