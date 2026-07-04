import { Hono } from "hono";
import { Cache } from "../utils/cache.js";
import { getDailyStreakers } from "../tools/get-daily-streakers.js";

const generalApi = new Hono().basePath("/api");

generalApi.get("/", (c) => {
	return c.text("Nope, not here.");
});

generalApi.get("/daily-streakers", async (c) => {
	const cacheName = "daily-streakers";
	const existingCache = Cache.get(cacheName);

	if (existingCache) {
		return c.json(existingCache);
	}

	const data = await getDailyStreakers();

	Cache.set(cacheName, data);
	return c.json(data);
});

export { generalApi };
