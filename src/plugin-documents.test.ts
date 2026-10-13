import { describe, expect, it } from "vitest";
import type { ProjectSettings } from "@inlang/sdk";
import { createNodeishMemoryFs } from "@lix-js/fs";
import { plugin } from "./plugin.js";

const settings = {
  sourceLanguageTag: "en",
  languageTags: ["en", "de"],
  modules: [],
  "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml" },
} satisfies ProjectSettings;

describe("YAML document roots", () => {
  it.each(["", " \n\t\n", "# translations\n", "---\n# translations\n...\n", "{}\n"])(
    "loads an empty mapping from %j",
    async (source) => {
      const nodeishFs = createNodeishMemoryFs();
      await nodeishFs.writeFile("./en.yaml", source);
      await nodeishFs.writeFile("./de.yaml", "greeting: Hallo\n");

      const messages = await plugin.loadMessages!({ settings, nodeishFs });

      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe("greeting");
      expect(messages[0]!.variants.map((variant) => variant.languageTag)).toEqual(["de"]);
    }
  );

  it.each(["plain text", "123", "true", "null", "- item", "2026-10-14"])(
    "rejects non-mapping root %j with the source path",
    async (source) => {
      const nodeishFs = createNodeishMemoryFs();
      await nodeishFs.writeFile("./en.yaml", source);

      await expect(plugin.loadMessages!({ settings, nodeishFs })).rejects.toThrow(
        'Invalid YAML document in "./en.yaml": expected a mapping of message keys.'
      );
    }
  );

  it("includes the source path in YAML syntax errors", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", "greeting: [unterminated\n");

    await expect(plugin.loadMessages!({ settings, nodeishFs })).rejects.toThrow("./en.yaml");
  });
});
