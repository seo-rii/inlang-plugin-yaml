import { expect, it } from "vitest";
import { createNodeishMemoryFs } from "@lix-js/fs";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";

it("preserves literal key-escape text in translations and variable names", async () => {
  const fs = createNodeishMemoryFs();
  const original = {
    nested: {
      message: "The code is u002E, not a dot. {u002E}",
      "trailing.": "u002Eu002E",
    },
  };
  await fs.writeFile("./en.yaml", YAML.dump(original));
  const settings = {
    sourceLanguageTag: "en",
    languageTags: ["en"],
    modules: [],
    "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml" },
  };
  const messages = await plugin.loadMessages!({ settings, nodeishFs: fs });
  await plugin.saveMessages!({ settings, nodeishFs: fs, messages });
  expect(YAML.load(await fs.readFile("./en.yaml", { encoding: "utf-8" })))
    .toEqual(original);
});
