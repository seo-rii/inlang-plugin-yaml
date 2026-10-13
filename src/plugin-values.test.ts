import { describe, expect, it } from "vitest";
import type { ProjectSettings } from "@inlang/sdk";
import { createNodeishMemoryFs } from "@lix-js/fs";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";

function settings(namespaced: boolean) {
  return {
    sourceLanguageTag: "en",
    languageTags: ["en"],
    modules: [],
    "plugin.inlang.yaml": {
      pathPattern: namespaced
        ? { common: "./{languageTag}.yaml" }
        : "./{languageTag}.yaml",
    },
  } satisfies ProjectSettings;
}

describe("YAML message values", () => {
  it.each([false, true])("preserves empty strings (namespaced: %s)", async (namespaced) => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", 'blank: ""\nnormal: present\n');
    const projectSettings = settings(namespaced);

    const messages = await plugin.loadMessages!({ settings: projectSettings, nodeishFs });

    expect(messages.map((message) => message.id)).toEqual(
      namespaced ? ["common:blank", "common:normal"] : ["blank", "normal"]
    );
    expect(messages[0]!.variants[0]!.pattern).toEqual([]);
    await plugin.saveMessages!({ messages, settings: projectSettings, nodeishFs });
    expect(YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual({
      blank: "",
      normal: "present",
    });
  });

  it.each([
    ["null", "null"],
    ["123", "number"],
    ["true", "boolean"],
    ["2026-10-14", "[object Date]"],
    ['!!binary "SGVsbG8="', "[object Uint8Array]"],
  ])("rejects unsupported scalar %s with file and key context", async (value, received) => {
    const nodeishFs = createNodeishMemoryFs();
    const source = `group:\n  invalid: ${value}\nnormal: present\n`;
    await nodeishFs.writeFile("./en.yaml", source);

    await expect(plugin.loadMessages!({ settings: settings(false), nodeishFs })).rejects.toThrow(
      `Unsupported YAML message value in "./en.yaml" at ["group","invalid"]: expected a string, received ${received}.`
    );
    expect(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" })).toBe(source);
  });

  it("allows empty mapping branches and shared non-circular aliases", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", "empty: {}\nfirst: &message\n  text: hello\nsecond: *message\n");

    const messages = await plugin.loadMessages!({ settings: settings(false), nodeishFs });

    expect(messages.map((message) => message.id)).toEqual(["first.text", "second.text"]);
  });

  it("rejects circular aliases with context instead of overflowing the stack", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", "group: &group\n  recursive: *group\n");

    await expect(plugin.loadMessages!({ settings: settings(false), nodeishFs })).rejects.toThrow(
      'Circular YAML alias in "./en.yaml" at ["group","recursive"].'
    );
  });
});
