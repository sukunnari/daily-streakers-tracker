class ConsolePrefixed {
	prefix: string;

	constructor(prefix: string) {
		this.prefix = prefix;
	}

	log(anything: unknown) {
		console.log(this.prefix, anything);
	}

	info(anything: unknown) {
		console.info(this.prefix, anything);
	}

	error(anything: unknown) {
		console.error(this.prefix, anything);
	}

	warn(anything: unknown) {
		console.error(this.prefix, anything);
	}
}

export { ConsolePrefixed };
