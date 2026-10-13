import { describe, expect, it } from "vitest";
import { createNodeishMemoryFs } from "@lix-js/fs";
import type { ProjectSettings } from "@inlang/sdk";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";
import type { PluginSettings } from "./settings.js";

const settingsFor = (pathPattern: PluginSettings["pathPattern"]) => ({
  sourceLanguageTag: "en",
  languageTags: ["en"],
  modules: [],
  "plugin.inlang.yaml": { pathPattern },
} satisfies ProjectSettings & { "plugin.inlang.yaml": PluginSettings });

describe("special YAML keys", () => {
  it("round-trips nested prototype-related paths without changing Object.prototype", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor("./{languageTag}.yaml");
    const source = "__proto__:\n  constructor: Safe\nouter:\n  __proto__: Also safe\n";
    const originalPrototype = Object.getOwnPropertyDescriptors(Object.prototype);
    await nodeishFs.writeFile("./en.yaml", source);
    const messages = await plugin.loadMessages!({ settings, nodeishFs });
    await plugin.saveMessages!({ messages, settings, nodeishFs });
    expect(YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual(YAML.load(source));
    expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual(messages);
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(originalPrototype);
  });

  it("round-trips prototype-related message names as own data properties", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = settingsFor("./{languageTag}.yaml");
    const source = "__proto__: Prototype\nconstructor: Constructor\ntoString: String\n";
    await nodeishFs.writeFile("./en.yaml", source);

    const messages = await plugin.loadMessages!({ settings, nodeishFs });
    expect(messages.map((message) => message.id)).toEqual(["__proto__", "constructor", "toString"]);
    await plugin.saveMessages!({ messages, settings, nodeishFs });

    const saved = YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }));
    expect(saved).toEqual(YAML.load(source));
    expect(Object.hasOwn(saved as object, "__proto__")).toBe(true);
    expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual(messages);
  });

  it.each(["__proto__", "constructor", "toString"])(
    "round-trips namespace %s without modifying Object.prototype",
    async (namespace) => {
      const nodeishFs = createNodeishMemoryFs();
      const settings = settingsFor({ [namespace]: "./{languageTag}.yaml" });
      const source = "__yaml_namespace_probe__: Safe\n__proto__: Prototype\n";
      const originalPrototype = Object.getOwnPropertyDescriptors(Object.prototype);
      await nodeishFs.writeFile("./en.yaml", source);

      try {
        const messages = await plugin.loadMessages!({ settings, nodeishFs });
        expect(messages.map((message) => message.id)).toEqual([
          `${namespace}:__yaml_namespace_probe__`,
          `${namespace}:__proto__`,
        ]);
        await plugin.saveMessages!({ messages, settings, nodeishFs });

        expect(YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual(YAML.load(source));
        expect(await plugin.loadMessages!({ settings, nodeishFs })).toEqual(messages);
        expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(originalPrototype);
      } finally {
        // Prevent a regression from leaving the test process polluted.
        for (const key of Object.getOwnPropertyNames(Object.prototype)) {
          if (!Object.hasOwn(originalPrototype, key)) {
            Reflect.deleteProperty(Object.prototype, key);
          }
        }
      }
    }
  );
});
