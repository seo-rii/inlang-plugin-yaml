import { describe, expect, it, vi } from "vitest";
import { createNodeishMemoryFs } from "@lix-js/fs";
import type { ProjectSettings } from "@inlang/sdk";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";
import type { PluginSettings } from "./settings.js";

const settingsFor = (
  pathPattern: PluginSettings["pathPattern"],
  languageTags = ["en", "de"]
) => ({
  sourceLanguageTag: "en",
  languageTags,
  modules: [],
  "plugin.inlang.yaml": { pathPattern },
} satisfies ProjectSettings & { "plugin.inlang.yaml": PluginSettings });

describe("saving message deletions", () => {
  it.each([
    { one: "./{languageTag}.yaml", two: "./{languageTag}.yaml" },
    { one: "./{languageTag}.yaml", two: "././{languageTag}.yaml" },
    { one: "./{languageTag}.yaml", two: "./folder/..//{languageTag}.yaml" },
  ])("rejects duplicate namespace targets before changing any files: %j", async (pathPattern) => {
    const nodeishFs = createNodeishMemoryFs();
    const source = "hello: Original\n";
    await nodeishFs.writeFile("./en.yaml", source);
    const settings = settingsFor(pathPattern);
    const messages = [{
      id: "one:hello",
      alias: {},
      selectors: [],
      variants: [{
        languageTag: "en",
        match: [],
        pattern: [{ type: "Text" as const, value: "Updated" }],
      }],
    }];
    const writeFile = vi.spyOn(nodeishFs, "writeFile");
    const mkdir = vi.spyOn(nodeishFs, "mkdir");

    await expect(plugin.saveMessages!({ messages, settings, nodeishFs }))
      .rejects.toThrow('Duplicate YAML output path "en.yaml"');

    expect(writeFile).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" })).toBe(source);
    expect(await nodeishFs.readdir("./")).toEqual(["en.yaml"]);
  });

  it("detects a collision in a later language before writing earlier languages", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.mkdir("./de", { recursive: true });
    await nodeishFs.mkdir("./en", { recursive: true });
    await nodeishFs.writeFile("./de/en.yaml", "hello: Deutsch\n");
    await nodeishFs.writeFile("./en/en.yaml", "hello: English\n");
    const settings = {
      ...settingsFor({ one: "./{languageTag}/en.yaml", two: "./en/{languageTag}.yaml" }, ["de", "en"]),
      sourceLanguageTag: "de",
    };
    const writeFile = vi.spyOn(nodeishFs, "writeFile");
    const mkdir = vi.spyOn(nodeishFs, "mkdir");

    await expect(plugin.saveMessages!({ messages: [], settings, nodeishFs }))
      .rejects.toThrow('Duplicate YAML output path "en/en.yaml"');

    expect(writeFile).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(await nodeishFs.readFile("./de/en.yaml", { encoding: "utf-8" })).toBe("hello: Deutsch\n");
    expect(await nodeishFs.readFile("./en/en.yaml", { encoding: "utf-8" })).toBe("hello: English\n");
  });

  it("checks actual variant languages even when they are absent from settings", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor({ one: "./{languageTag}/de.yaml", two: "./de/{languageTag}.yaml" }, ["en"]);
    const writeFile = vi.spyOn(nodeishFs, "writeFile");
    const mkdir = vi.spyOn(nodeishFs, "mkdir");
    const messages = [{
      id: "one:hello", alias: {}, selectors: [],
      variants: [{ languageTag: "de", match: [], pattern: [{ type: "Text" as const, value: "Hallo" }] }],
    }];

    await expect(plugin.saveMessages!({ messages, settings, nodeishFs }))
      .rejects.toThrow('Duplicate YAML output path "de/de.yaml"');

    expect(writeFile).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(await nodeishFs.readdir("./")).toEqual([]);
  });

  it("rejects a path that resolves to the same file for multiple languages", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./messages.yaml", "hello: Original\n");
    const settings = settingsFor("./{languageTag}/../messages.yaml");
    const writeFile = vi.spyOn(nodeishFs, "writeFile");

    await expect(plugin.saveMessages!({ messages: [], settings, nodeishFs }))
      .rejects.toThrow('Duplicate YAML output path "messages.yaml"');

    expect(writeFile).not.toHaveBeenCalled();
    expect(await nodeishFs.readFile("./messages.yaml", { encoding: "utf-8" })).toBe("hello: Original\n");
  });

  it("keeps absolute, relative, and parent-relative output paths distinct", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const readFile = vi.spyOn(nodeishFs, "readFile");
    const settings = settingsFor({
      absolute: "/{languageTag}.yaml",
      relative: "./{languageTag}.yaml",
      parent: "../{languageTag}.yaml",
    }, ["en"]);

    await plugin.saveMessages!({ messages: [], settings, nodeishFs });

    expect(readFile.mock.calls.map(([path]) => path)).toEqual([
      "/en.yaml", "./en.yaml", "../en.yaml",
    ]);
    expect(await nodeishFs.readdir("./")).toEqual([]);
  });

  it.each([{ languageTags: ["en", "de"] }, { languageTags: ["de"] }])(
    "clears the final source message with configured languages $languageTags",
    async ({ languageTags }) => {
      const nodeishFs = createNodeishMemoryFs();
      const settings = settingsFor("./{languageTag}.yaml", languageTags);
      await nodeishFs.writeFile("./en.yaml", "hello: Hello\n");

      await plugin.saveMessages!({ messages: [], settings, nodeishFs });

      expect(YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual({});
      expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual([]);
    }
  );

  it("clears a locale after deleting its final variant", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor("./{languageTag}.yaml");
    await nodeishFs.writeFile("./en.yaml", "hello: Hello\n");
    await nodeishFs.writeFile("./de.yaml", "hello: Hallo\n");
    const messages = await plugin.loadMessages!({ settings, nodeishFs });
    messages[0]!.variants = messages[0]!.variants.filter(
      (variant) => variant.languageTag === "en"
    );

    await plugin.saveMessages!({ messages, settings, nodeishFs });

    expect(YAML.load(await nodeishFs.readFile("./de.yaml", { encoding: "utf-8" }))).toEqual({});
    expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual(messages);
  });

  it("clears the final message in a namespace while retaining another namespace", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor({
      common: "./{languageTag}.common.yaml",
      page: "./{languageTag}.page.yaml",
    });
    await nodeishFs.writeFile("./en.common.yaml", "hello: Hello\n");
    await nodeishFs.writeFile("./en.page.yaml", "title: Page\n");
    const messages = (await plugin.loadMessages!({ settings, nodeishFs })).filter(
      (message) => message.id.startsWith("page:")
    );

    await plugin.saveMessages!({ messages, settings, nodeishFs });

    expect(YAML.load(await nodeishFs.readFile("./en.common.yaml", { encoding: "utf-8" }))).toEqual({});
    expect(YAML.load(await nodeishFs.readFile("./en.page.yaml", { encoding: "utf-8" }))).toEqual({ title: "Page" });
    expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual(messages);
  });

  it("clears all existing namespace and language files for an empty message set", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor({
      common: "./{languageTag}.common.yaml",
      page: "./{languageTag}.page.yaml",
    });
    const paths = ["./en.common.yaml", "./de.common.yaml", "./de.page.yaml"];
    for (const path of paths) await nodeishFs.writeFile(path, "hello: Hello\n");

    await plugin.saveMessages!({ messages: [], settings, nodeishFs });

    for (const path of paths) {
      expect(YAML.load(await nodeishFs.readFile(path, { encoding: "utf-8" }))).toEqual({});
    }
    expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual([]);
  });

  it.each(["./absent/{languageTag}.yaml", { common: "./absent/{languageTag}.yaml" }])(
    "does not create absent empty targets for %j",
    async (pathPattern) => {
      const nodeishFs = createNodeishMemoryFs();
      const settings = settingsFor(pathPattern);

      await plugin.saveMessages!({ messages: [], settings, nodeishFs });

      expect(await nodeishFs.readdir("./")).toEqual([]);
    }
  );

  it("preserves a read error when checking an existing empty target", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const error = Object.assign(new Error("Permission denied"), { code: "EACCES" });
    nodeishFs.readFile = async () => { throw error; };

    await expect(plugin.saveMessages!({
      messages: [],
      settings: settingsFor("./{languageTag}.yaml"),
      nodeishFs,
    })).rejects.toBe(error);
  });
});
