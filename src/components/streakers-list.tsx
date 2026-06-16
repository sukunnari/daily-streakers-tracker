function StreakersList({ children }: { children?: any }) {
	return <ul class="streakers-list">{children}</ul>;
}

function StreakersItem({
	playerName,
	osuId,
	hasPlayedToday,
	tierIndex,
	currentStreak,
	bestStreak,
	previousStreak,
	showCurrent,
	showBest,
	errorMessage,
}: {
	playerName: string;
	osuId: number;
	hasPlayedToday: boolean;
	tierIndex: number;
	currentStreak: number;
	bestStreak: number;
	previousStreak: number;
	showCurrent?: boolean;
	showBest?: boolean;
	errorMessage?: string;
}) {
	let arrowTierSrc: string = "";
	let altTier: string = "";
	let outlineTierClassname: string = "";

	let showPrevious: boolean = false;

	switch (tierIndex) {
		case -3:
			arrowTierSrc = "./assets/arrow-down-double.png";
			altTier = "This player is no longer a full streaker.";
			outlineTierClassname = "streakers-list__item--fallen";
			showPrevious = true;
			break;
		case -2:
			arrowTierSrc = "./assets/arrow-down-double.png";
			altTier = "This player has just lost their streak significantly.";
			outlineTierClassname = "streakers-list__item--downgraded";
			showPrevious = true;
			break;
		case -1:
			arrowTierSrc = "./assets/arrow-down.png";
			altTier = "This player is no longer a casual streaker.";
			showPrevious = true;
			break;
		case 1:
			arrowTierSrc = "./assets/arrow-up.png";
			altTier = "This player has just became a casual streaker.";
			outlineTierClassname = "streakers-list__item--upgraded";
		default:
			break;
	}

	return (
		<li
			class={`streakers-list__item ${hasPlayedToday ? "streakers-list__item--played" : outlineTierClassname}`}
		>
			<a
				class="streakers-list__link"
				target="_blank"
				href={`https://osu.ppy.sh/users/${osuId}`}
			>
				<span>{playerName}</span>
				{hasPlayedToday && <span class="sr-only">&nbsp;(played)</span>}
			</a>
			{showCurrent &&
			showBest &&
			currentStreak > 0 &&
			bestStreak > 0 &&
			currentStreak === bestStreak ? (
				<div
					class="streakers-list__count"
					aria-description="Current and Best Streak"
				>
					{`Curr & Best: ${currentStreak}`}
				</div>
			) : (
				<>
					{showCurrent && currentStreak > 0 && (
						<div
							class="streakers-list__count"
							aria-description="Current Streak"
						>
							{`Curr: ${currentStreak}`}
						</div>
					)}
					{showBest && bestStreak > 0 && (
						<div class="streakers-list__count" aria-description="Best Streak">
							{`Best: ${bestStreak}`}
						</div>
					)}
				</>
			)}

			{showPrevious && (
				<div class="streakers-list__count" aria-description="Previous Streak">
					{`Prev: ${previousStreak}`}
				</div>
			)}
			{/* <div class="streakers-list__insert-helper"></div> */}
			{arrowTierSrc && (
				<div class="streakers-list__tier">
					<img class="streakers-list__tier-image" alt={""} src={arrowTierSrc} />
					{altTier && <span class="sr-only">{altTier}</span>}
				</div>
			)}
			{errorMessage && (
				<div class="streakers-list__tier">
					<img
						class="streakers-list__tier-image"
						alt={""}
						src={"./assets/error-indicator.png"}
					/>
					<span class="sr-only">{errorMessage}</span>
				</div>
			)}
		</li>
	);
}

export { StreakersItem, StreakersList };
