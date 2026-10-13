import { describe, expect, it, vi } from "vitest";
import { createNodeishMemoryFs } from "@lix-js/fs";
import type { Message, ProjectSettings } from "@inlang/sdk";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";
import type { PluginSettings } from "./settings.js";

const settingsFor = (pathPattern: PluginSettings["pathPattern"]) => ({
  sourceLanguageTag: "en",
  languageTags: ["en"],
  modules: [],
  "plugin.inlang.yaml": { pathPattern },
} satisfies ProjectSettings & { "plugin.inlang.yaml": PluginSettings });

const messages: Message[] = [{
  id: "greeting",
  alias: {},
  selectors: [],
  variants: [{
    languageTag: "en",
    match: [],
    pattern: [{ type: "Text", value: "Hello" }],
  }],
}];

describe("creating locale directories", () => {
  it("creates missing parents when saving a namespace", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor({
      common: "./locales/{languageTag}/messages/common.yaml",
    });

    await plugin.saveMessages!({ messages, settings, nodeishFs });

    expect(YAML.load(await nodeishFs.readFile(
      "./locales/en/messages/common.yaml",
      { encoding: "utf-8" }
    ))).toEqual({ greeting: "Hello" });
  });

  it.each([
    "./locales/{languageTag}/messages.yaml",
    { common: "./locales/{languageTag}/messages.yaml" },
  ])("propagates directory access errors for %j", async (pathPattern) => {
    const nodeishFs = createNodeishMemoryFs();
    const error = Object.assign(new Error("Permission denied"), { code: "EACCES" });
    nodeishFs.readdir = async () => { throw error; };
    const mkdir = vi.spyOn(nodeishFs, "mkdir");

    await expect(plugin.saveMessages!({
      messages,
      settings: settingsFor(pathPattern),
      nodeishFs,
    })).rejects.toBe(error);

    expect(mkdir).not.toHaveBeenCalled();
  });

  it("propagates failures to create a missing namespace directory", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const error = Object.assign(new Error("Read-only filesystem"), { code: "EROFS" });
    nodeishFs.mkdir = async () => { throw error; };

    await expect(plugin.saveMessages!({
      messages,
      settings: settingsFor({ common: "./locales/{languageTag}/common.yaml" }),
      nodeishFs,
    })).rejects.toBe(error);
  });
});
