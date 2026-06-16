import { Card } from "./card.js";
import { StreakersList, StreakersItem } from "./streakers-list.js";
import { getDailyStreakers } from "../tools/get-daily-streakers.js";
import { Cache } from "../utils/cache.js";

async function getData() {
	const cacheName = "daily-streakers";
	const existingCache = Cache.get(cacheName);

	if (existingCache) {
		return existingCache as ReturnType<typeof getDailyStreakers>;
	}

	const data = await getDailyStreakers();

	Cache.set(cacheName, data);
	return data;
}

type pageState = {
	sort: string;
	showCurrent?: boolean;
	showBest?: boolean;
};

const sortOptions: {
	name: string;
	uiName: string;
	defaultSort: "ascending" | "descending";
}[] = [
	{ name: "name", uiName: "Name", defaultSort: "ascending" },
	{ name: "rank", uiName: "Rank", defaultSort: "ascending" },
	{ name: "has-played", uiName: "Has Played", defaultSort: "descending" },
	{
		name: "current-streak",
		uiName: "Current Streak",
		defaultSort: "descending",
	},
	{ name: "best-streak", uiName: "Best Streak", defaultSort: "descending" },
];

const showOptions: {
	name: string;
	uiName: string;
	forceEnabledBy?: string[]; // allow show options to be forcibly enabled by any specified sort options
}[] = [
	{
		name: "show-current",
		uiName: "Show current streak",
		forceEnabledBy: ["current-streak"],
	},
	{
		name: "show-best",
		uiName: "Show best streak",
		forceEnabledBy: ["best-streak"],
	},
];

async function MainPage({ queries }: { queries: Record<string, string> }) {
	const sort = queries?.["sort"] || "";
	const showBest = Object.keys(queries).includes("show-best") ? true : false;
	const showCurrent = Object.keys(queries).includes("show-current")
		? true
		: false;

	const userSort =
		sortOptions.find((s) => s.name === sort.split("_")[0]) || sortOptions[0];
	const isDescending = sort.split("_")[1] === "desc";

	const data = await getData();

	// Everything has to be sorted by name first
	data.sort((_a, _b) => {
		const a = String(_a.name);
		const b = String(_b.name);
		if (a.toUpperCase() === b.toUpperCase()) {
			return 0;
		} else {
			return a.toUpperCase() > b.toUpperCase() ? 1 : -1;
		}
	});

	switch (userSort.name) {
		case "name":
			if (isDescending) {
				data.sort((_a, _b) => {
					const a = String(_a.name);
					const b = String(_b.name);
					if (a.toUpperCase() === b.toUpperCase()) {
						return 0;
					} else {
						return b.toUpperCase() > a.toUpperCase() ? 1 : -1;
					}
				});
			}
			// Everything has been sorted with ascending name by default
			// So we only need descending function here
			break;

		case "rank":
			if (isDescending) {
				data.sort((_a, _b) => {
					const a = Number(_a.rank_standard);
					const b = Number(_b.rank_standard);
					return b - a;
				});
			} else {
				data.sort((_a, _b) => {
					const a = Number(_a.rank_standard);
					const b = Number(_b.rank_standard);
					return a - b;
				});
			}
			break;

		case "current-streak":
			if (isDescending) {
				data.sort((_a, _b) => {
					const a = Number(_a.current_streak);
					const b = Number(_b.current_streak);
					return b - a;
				});
			} else {
				data.sort((_a, _b) => {
					const a = Number(_a.current_streak);
					const b = Number(_b.current_streak);
					return a - b;
				});
			}
			break;

		case "best-streak":
			if (isDescending) {
				data.sort((_a, _b) => {
					const a = Number(_a.best_daily_streak);
					const b = Number(_b.best_daily_streak);
					return b - a;
				});
			} else {
				data.sort((_a, _b) => {
					const a = Number(_a.best_daily_streak);
					const b = Number(_b.best_daily_streak);
					return a - b;
				});
			}
			break;

		case "has-played":
			// Convert the boolean into number
			if (isDescending) {
				data.sort((_a, _b) => {
					const a = Number(_a.has_played_today);
					const b = Number(_b.has_played_today);
					return b - a;
				});
			} else {
				data.sort((_a, _b) => {
					const a = Number(_a.has_played_today);
					const b = Number(_b.has_played_today);
					return a - b;
				});
			}
			break;

		default:
			// Leave everything sorted by ascending name
			break;
	}

	const fullStreakersData = data.filter((player) => player.full_streaker);
	const casualStreakersData = data.filter(
		(player) => player.is_streaking && !player.full_streaker,
	);
	const notStreakersData = data.filter(
		(player) => !player.is_streaking && !player.full_streaker,
	);

	const lastUpdates = data.map((players) => {
		const dateString = players.last_update;
		const dateObject = new Date(dateString);
		const dateNumber = dateObject.getTime();

		return {
			text: dateString,
			time: dateNumber,
		};
	});

	const _lastUpdate = lastUpdates.toSorted((_a, _b) => {
		const a = Number(_a.time);
		const b = Number(_b.time);
		return b - a;
	})[0];

	const lastUpdate = new Date(_lastUpdate.text).toUTCString();

	const userEnabledShowOptions: Record<string, string> = {};

	showOptions.forEach((s) => {
		if (Object.keys(queries).includes(s.name)) {
			userEnabledShowOptions[s.name] = "";
		}
	});

	const userParams: Record<string, string> = {
		sort: sort,
		...userEnabledShowOptions,
	};

	// Force the internal state to show best/current whenever necessary
	const internalShowBest =
		showOptions
			.find((opt) => opt.name == "show-best")
			?.forceEnabledBy?.includes(userSort.name) || showBest;
	const internalShowCurrent =
		showOptions
			.find((opt) => opt.name == "show-current")
			?.forceEnabledBy?.includes(userSort.name) || showCurrent;

	return (
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Daily Streakers Tracker</title>
				<link rel="stylesheet" href="./assets/global.css?v=20260422" />
				<link rel="stylesheet" href="./assets/daily-streakers.css?v=20260411" />
			</head>
			<body>
				<header class="header">
					<h1 class="header__title">Daily Streakers Tracker</h1>
				</header>
				<main>
					<Card>
						<div class="sorter" hx-boost>
							<ul class="sorter__list">
								<span class="sorter__label">Sort by:</span>
								{sortOptions.map((s) => {
									const defaultSort =
										s.defaultSort === "descending" ? "_desc" : "_asc";
									const isActive = userSort.name === s.name;
									const sortPrefix = `${isActive ? (!isDescending ? "_desc" : "_asc") : defaultSort}`;
									const sortParam = `${s.name}${sortPrefix}`;
									const newParams = new URLSearchParams({
										...userParams,
										sort: sortParam,
									});

									return (
										<li
											class={`sorter__item ${isActive ? "sorter__item--active" : ""} sorter__item--enable-moving-transition`}
										>
											<a class="sorter__link" href={`./?${newParams}`}>
												<span>{s.uiName}</span>
											</a>
											<div class="sorter__indicator">
												<img
													class="sorter__indicator-image"
													src={`./assets/sort${isActive ? (isDescending ? "_desc" : "_asc") : defaultSort}.png`}
													alt=""
												/>
												{isActive && (
													<span class="sr-only">
														(Active, currently&nbsp;
														{isDescending ? "descending" : "ascending"})
													</span>
												)}
											</div>
										</li>
									);
								})}
							</ul>
							<ul class="sorter__list">
								{/* Options for showing best & current streak */}
								<span class="sorter__label">Options:</span>
								{showOptions.map((s) => {
									const newParamsObject = { ...userParams };
									const userEnabled = Object.keys(newParamsObject).includes(
										s.name,
									);
									const forceEnabled = s.forceEnabledBy?.includes(
										userSort.name,
									);

									// Try to do the opposite of what's in the request
									if (userEnabled) {
										delete newParamsObject[s.name];
									} else {
										newParamsObject[s.name] = "";
									}

									const newParams = new URLSearchParams(newParamsObject);

									return (
										<li
											class={`sorter__item ${userEnabled ? "sorter__item--active" : ""} ${forceEnabled ? "sorter__item--force-show-indicator" : ""}`}
										>
											<a class="sorter__link" href={`./?${newParams}`}>
												<span>{s.uiName}</span>
											</a>
											<div class={`sorter__indicator`}>
												<img
													class="sorter__indicator-image"
													src="./assets/sort_check.png"
													alt=""
												/>
												{userEnabled && <span class="sr-only">(Active)</span>}
												{forceEnabled && !userEnabled && (
													<span class="sr-only">
														(Required by the sort option)
													</span>
												)}
											</div>
										</li>
									);
								})}
							</ul>
						</div>
					</Card>
					<Card
						title="Full Streakers"
						descriptions="Full streakers are those who never break their streaks since day
							one which is really cool and should be appreciated for their hard
							work."
					>
						<StreakersList>
							{fullStreakersData.map((player) => (
								<StreakersItem
									bestStreak={player.best_daily_streak || 0}
									currentStreak={player.current_streak || 0}
									hasPlayedToday={player.has_played_today || false}
									tierIndex={(player.tier_change as number) || 0}
									osuId={player.osu_id || 0}
									playerName={player.name || ""}
									previousStreak={player.previous_daily_streak || 0}
									showBest={internalShowBest}
									showCurrent={internalShowCurrent}
									errorMessage={
										player.is_errored ? "Error while fetching data" : undefined
									}
								/>
							))}
						</StreakersList>
					</Card>
					<Card
						title="Casual Streakers"
						descriptions="Casual streakers are equally cool players whose streak value is
							less than the total days of daily challenge, which also needs to
							be appreciated for their dedication."
					>
						<StreakersList>
							{casualStreakersData.map((player) => (
								<StreakersItem
									bestStreak={player.best_daily_streak || 0}
									currentStreak={player.current_streak || 0}
									hasPlayedToday={player.has_played_today || false}
									tierIndex={(player.tier_change as number) || 0}
									osuId={player.osu_id || 0}
									playerName={player.name || ""}
									previousStreak={player.previous_daily_streak || 0}
									showBest={internalShowBest}
									showCurrent={internalShowCurrent}
									errorMessage={
										player.is_errored ? "Error while fetching data" : undefined
									}
								/>
							))}
						</StreakersList>
					</Card>
					<Card
						title="Not Streaking"
						descriptions="These players are former full streakers or casual streakers who
							don't really play daily challenge anymore but still deserve
							appreciations for the work that they've done."
					>
						<StreakersList>
							{notStreakersData.map((player) => (
								<StreakersItem
									bestStreak={player.best_daily_streak || 0}
									currentStreak={player.current_streak || 0}
									hasPlayedToday={player.has_played_today || false}
									tierIndex={(player.tier_change as number) || 0}
									osuId={player.osu_id || 0}
									playerName={player.name || ""}
									previousStreak={player.previous_daily_streak || 0}
									showBest={internalShowBest}
									showCurrent={internalShowCurrent}
									errorMessage={
										player.is_errored ? "Error while fetching data" : undefined
									}
								/>
							))}
						</StreakersList>
					</Card>
					<Card
						descriptions={
							<span id="info">
								All items are updated every 30 minutes. (last update:&nbsp;
								{lastUpdate})
							</span>
						}
					></Card>
					<footer>
						<span>
							This website is open source! Check it on&nbsp;
							<a
								href="https://github.com/thekrowned/daily-streakers-tracker"
								target="_blank"
								rel="noopener noreferrer"
							>
								GitHub
							</a>
							.
						</span>
					</footer>
				</main>
				<script
					type="text/javascript"
					src="./library/htmx.min.js?rev=20260411"
				></script>
				{/* <script
					type="text/javascript"
					src="./assets/storage-check.js?v=20250929"
				></script>
				<script
					type="text/javascript"
					src="./assets/daily-streakers.js?v=20260326"
				></script> */}
			</body>
		</html>
	);
}

export { MainPage };
