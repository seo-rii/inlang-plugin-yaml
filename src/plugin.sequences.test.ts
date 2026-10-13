import { expect, it } from "vitest";
import { createNodeishMemoryFs } from "@lix-js/fs";
import { plugin } from "./plugin.js";

it.each([
  "messages:\n  - First\n  - Second\n",
  "messages: []\n",
  "messages:\n  - text: Hello\n",
])("rejects unsupported sequences instead of rewriting them as mappings", async (original) => {
  const fs = createNodeishMemoryFs();
  await fs.writeFile("./en.yaml", original);
  const settings = {
    sourceLanguageTag: "en", languageTags: ["en"], modules: [],
    "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml" },
  };
  await expect(plugin.loadMessages!({ settings, nodeishFs: fs }))
    .rejects.toThrow("YAML sequences are not supported in ./en.yaml at messages");
  expect(await fs.readFile("./en.yaml", { encoding: "utf-8" })).toBe(original);
});
