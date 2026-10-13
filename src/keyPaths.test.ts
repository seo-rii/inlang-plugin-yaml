import { describe, expect, it } from "vitest";
import { createNodeishMemoryFs } from "@lix-js/fs";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";
import { flattenMessages, unflattenMessages } from "./keyPaths.js";

describe("lossless YAML key paths", () => {
  it("distinguishes nested paths, literal dots, backslashes, and escape-marker text", () => {
    const original = {
      "a.b": "flat",
      a: { b: "nested", "": "empty key" },
      "a\\b": "backslash",
      "a\\.b": "escaped dot",
      "u002E": "literal marker",
      "..": "dots",
      "": { "": "empty segments" },
      "trailing.": "trailing dot",
    };
    const flattened = flattenMessages(original);
    expect(flattened["a\\.b"]).toBe("flat");
    expect(flattened["a.b"]).toBe("nested");
    expect(unflattenMessages(flattened)).toEqual(original);
  });

  it.each([
    { a: "leaf", "a.b": "child" },
    { "a.b": "child", a: "leaf" },
  ])("rejects conflicting edited message paths without dropping data", (messages) => {
    expect(() => unflattenMessages(messages)).toThrow("Conflicting YAML key path");
  });

  it.each(["unfinished\\", "invalid\\q"])("rejects malformed key escapes in %s", (id) => {
    expect(() => unflattenMessages({ [id]: "value" })).toThrow("key escape");
  });

  it("preserves prototype-like names as ordinary nested YAML keys", () => {
    const original = YAML.load("__proto__:\n  polluted: text\nconstructor:\n  prototype: literal\n") as Record<string, unknown>;
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    expect(unflattenMessages(flattenMessages(original))).toEqual(original);
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before);
  });

  it("round-trips colliding-looking keys without combining their variants", async () => {
    const fs = createNodeishMemoryFs();
    const original = { "a.b": "flat", a: { b: "nested" }, au002Eb: "marker" };
    await fs.writeFile("./en.yaml", YAML.dump(original));
    const settings = {
      sourceLanguageTag: "en", languageTags: ["en"], modules: [],
      "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml" },
    };
    const messages = await plugin.loadMessages!({ settings, nodeishFs: fs });
    expect(messages.map((message) => message.id)).toEqual(["a\\.b", "a.b", "au002Eb"]);
    expect(messages.every((message) => message.variants.length === 1)).toBe(true);
    await plugin.saveMessages!({ settings, nodeishFs: fs, messages });
    expect(YAML.load(await fs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual(original);
  });

  it("keeps each file's structure across locales, namespaces, and projects", async () => {
    for (const pathPattern of ["./{languageTag}.yaml", { common: "./{languageTag}.yaml" }]) {
      for (const original of [{ nested: { key: "value" } }, { "flat.key": "value" }]) {
        const fs = createNodeishMemoryFs();
        await fs.writeFile("./en.yaml", YAML.dump(original));
        await fs.writeFile("./de.yaml", "separate.key: Wert\n");
        const settings = {
          sourceLanguageTag: "en", languageTags: ["en", "de"], modules: [],
          "plugin.inlang.yaml": { pathPattern },
        };
        const messages = await plugin.loadMessages!({ settings, nodeishFs: fs });
        await plugin.saveMessages!({ settings, nodeishFs: fs, messages });
        expect(YAML.load(await fs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual(original);
        expect(YAML.load(await fs.readFile("./de.yaml", { encoding: "utf-8" }))).toEqual({ "separate.key": "Wert" });
      }
    }
  });
});
