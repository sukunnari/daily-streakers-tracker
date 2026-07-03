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

import { manageApi, managePageMiddleware } from "./web-api/manage.js";
import { generalApi } from "./web-api/general.js";
import { authApi } from "./web-api/auth.js";

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

app.route("/", managePageMiddleware);
app.route("/", manageApi);
app.route("/", authApi);
app.route("/", generalApi);

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
for (let i = 1; i <= 22; i++) {
	updatePlayersTimes.push([i, 1]);
	updatePlayersTimes.push([i, 35]);
}
updatePlayersTimes.push([23, 1]);
updatePlayersTimes.push([23, 45]);

UtcAlarmManager.add({
	name: "Update Tracked Players",
	callback: updateAllTrackedPlayers,
	time: updatePlayersTimes,
});

UtcAlarmManager.add({
	name: "Crawler",
	callback: updatePlayersFromLeaderboardCrawl,
	time: [
		[23, 20],
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
