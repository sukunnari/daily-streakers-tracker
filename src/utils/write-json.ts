import * as fs from "node:fs/promises";
import * as prettier from "prettier";

async function writeJSON(path: string, jsonObject: object): Promise<void> {
	await fs.access(path, fs.constants.R_OK);
	const data = await prettier.format(JSON.stringify(jsonObject), {
		filepath: ".prettierrc",
		useTabs: true,
		endOfLine: "lf",
		printWidth: 80,
	});
	await fs.writeFile(path, data, { encoding: "utf-8" });
}

export { writeJSON };
