import path from "path";
import { readJson } from "../utils/read-json.js";
import { writeJSON } from "../utils/write-json.js";
import * as z from "zod";

const jsonPath = path.join(path.resolve(), "config.json");

const configZodObject = z.any();

const Config = class {
	static read = async function () {
		const configRaw = await readJson(jsonPath);
		const configParsed = configZodObject.parse(configRaw);
		return configParsed;
	};

	static write = async function (config: z.infer<typeof configZodObject>) {
		const prevConfigRaw = await readJson(jsonPath);
		const newConfig = {
			...prevConfigRaw,
			...config,
		};

		await writeJSON(jsonPath, newConfig);
	};
};

export { Config };
