import { describe, expect, it } from "vitest";
import type { Message, ProjectSettings } from "@inlang/sdk";
import { createNodeishMemoryFs } from "@lix-js/fs";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";

const message = (id: string): Message => ({
  id,
  alias: {},
  selectors: [],
  variants: [{ languageTag: "en", match: [], pattern: [{ type: "Text", value: "updated" }] }],
});

describe.each([false, true])("ignored paths (namespaced: %s)", (namespaced) => {
  it.each(["./en.yaml", "en.yaml", "././en.yaml"])(
    "does not load or overwrite the exact ignored path %j",
    async (ignoredPath) => {
      const nodeishFs = createNodeishMemoryFs();
      const ignoredContent = "invalid: [unterminated\n";
      await nodeishFs.writeFile("./en.yaml", ignoredContent);
      await nodeishFs.writeFile("./de.yaml", "greeting: Hallo\n");
      const settings = {
        sourceLanguageTag: "en",
        languageTags: ["en", "de"],
        modules: [],
        "plugin.inlang.yaml": {
          pathPattern: namespaced ? { common: "./{languageTag}.yaml" } : "./{languageTag}.yaml",
          ignore: [ignoredPath],
        },
      } satisfies ProjectSettings;

      const messages = await plugin.loadMessages!({ settings, nodeishFs });

      expect(messages).toHaveLength(1);
      expect(messages[0]!.variants.map((variant) => variant.languageTag)).toEqual(["de"]);
      messages[0]!.variants[0]!.pattern = [{ type: "Text", value: "updated" }];
      messages[0]!.variants.push(message("unused").variants[0]!);
      await plugin.saveMessages!({ messages, settings, nodeishFs });
      expect(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" })).toBe(ignoredContent);
      expect(YAML.load(await nodeishFs.readFile("./de.yaml", { encoding: "utf-8" }))).toEqual({
        greeting: "updated",
      });
    }
  );

  it("interpolates locale placeholders and skips ignored output directories", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const pathPattern = "./missing/deep/{languageTag}.yaml";
    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      "plugin.inlang.yaml": {
        pathPattern: namespaced ? { archive: pathPattern } : pathPattern,
        ignore: ["missing/deep/{languageTag}.yaml"],
      },
    } satisfies ProjectSettings;

    expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual([]);
    await plugin.saveMessages!({
      messages: [message(namespaced ? "archive:greeting" : "greeting")],
      settings,
      nodeishFs,
    });
    expect(await nodeishFs.readdir("./")).toEqual([]);
  });

  it("preserves ignored files when all messages are removed", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", "greeting: untouched\n");
    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      "plugin.inlang.yaml": {
        pathPattern: namespaced ? { common: "./{languageTag}.yaml" } : "./{languageTag}.yaml",
        ignore: ["./en.yaml"],
      },
    } satisfies ProjectSettings;

    await plugin.saveMessages!({ messages: [], settings, nodeishFs });

    expect(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" })).toBe("greeting: untouched\n");
  });
});

it("does not interpret ignore entries as globs or prefixes", async () => {
  const nodeishFs = createNodeishMemoryFs();
  await nodeishFs.writeFile("./en.yaml", "greeting: original\n");
  const settings = {
    sourceLanguageTag: "en",
    languageTags: ["en"],
    modules: [],
    "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml", ignore: ["*.yaml", "en"] },
  } satisfies ProjectSettings;

  expect(await plugin.loadMessages!({ settings, nodeishFs })).toHaveLength(1);
  await plugin.saveMessages!({ messages: [message("greeting")], settings, nodeishFs });

  expect(YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual({
    greeting: "updated",
  });
});
