// Do you want to wait & chill before doing a task?
// Well, this function is for you

function sleep(timeMs: number) {
	return new Promise<void>((resolve, reject) => {
		setTimeout(() => resolve(), timeMs);
	});
}

export { sleep };
