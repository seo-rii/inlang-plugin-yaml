import { describe, expect, it } from "vitest";
import type { Message, ProjectSettings } from "@inlang/sdk";
import { createNodeishMemoryFs } from "@lix-js/fs";
import { Value } from "@sinclair/typebox/value";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";

function project(
  configuration: {
    keySeparator?: "." | "_";
    pathPattern?: string | Record<string, string>;
    ignore?: string[];
  } = { keySeparator: "_" },
  languageTags = ["en"]
) {
  return {
    sourceLanguageTag: "en",
    languageTags,
    modules: [],
    "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml", ...configuration },
  } satisfies ProjectSettings;
}

function message(id: string, translations: Record<string, string>): Message {
  return {
    id,
    alias: {},
    selectors: [],
    variants: Object.entries(translations).map(([languageTag, value]) => ({
      languageTag,
      match: [],
      pattern: [{ type: "Text", value }],
    })),
  };
}

async function readYaml(nodeishFs: ReturnType<typeof createNodeishMemoryFs>, path: string) {
  return YAML.load(await nodeishFs.readFile(path, { encoding: "utf-8" }));
}

describe("configurable YAML key separators", () => {
  it.each([undefined, "."] as const)("keeps escaped dot paths with separator %j", async (keySeparator) => {
    const nodeishFs = createNodeishMemoryFs();
    const original = {
      language: { zh_hans: "Chinese" },
      "literal.dot": "dot",
      "literal\\slash": "backslash",
    };
    await nodeishFs.writeFile("./en.yaml", YAML.dump(original));
    const settings = project(keySeparator === undefined ? {} : { keySeparator });

    const messages = await plugin.loadMessages!({ settings, nodeishFs });

    expect(messages.map(({ id }) => id)).toEqual([
      "language.zh_hans", "literal\\.dot", "literal\\\\slash",
    ]);
    await plugin.saveMessages!({ messages, settings, nodeishFs });
    expect(await readYaml(nodeishFs, "./en.yaml")).toEqual(original);
  });

  it("retains existing underscore IDs and original segment boundaries", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const original = {
      language: { zh_hans: "Chinese" },
      problem: { list: { sort: { solved_asc: "Most solved" } } },
    };
    await nodeishFs.writeFile("./en.yaml", YAML.dump(original));
    const settings = project();

    const messages = await plugin.loadMessages!({ settings, nodeishFs });

    expect(messages.map(({ id }) => id)).toEqual([
      "language_zh_hans", "problem_list_sort_solved_asc",
    ]);
    await plugin.saveMessages!({ messages, settings, nodeishFs });
    expect(await readYaml(nodeishFs, "./en.yaml")).toEqual(original);
  });

  it("keeps literal dots and backslashes unescaped in underscore IDs", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const original = {
      "literal.dot": "root dot",
      "literal\\slash": "root backslash",
      group: { "child.with.dot": "child dot", "child\\slash": "child backslash" },
    };
    await nodeishFs.writeFile("./en.yaml", YAML.dump(original));
    const settings = project();

    const messages = await plugin.loadMessages!({ settings, nodeishFs });

    expect(messages.map(({ id }) => id)).toEqual([
      "literal.dot", "literal\\slash", "group_child.with.dot", "group_child\\slash",
    ]);
    await plugin.saveMessages!({ messages, settings, nodeishFs });
    expect(await readYaml(nodeishFs, "./en.yaml")).toEqual(original);
  });

  it.each([
    { a_b: "same", a: { b: "same" } },
    { a: { b: "nested" }, a_b: "flat" },
  ])("rejects ambiguous IDs even when both values are equal", async (original) => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", YAML.dump(original));

    await expect(plugin.loadMessages!({ settings: project(), nodeishFs })).rejects.toThrow(
      /colli|conflict|ambig|duplicate/i
    );
  });

  it("prefers each target file's layout for the same ID without requiring an earlier load", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", YAML.dump({ language: { zh_hans: "source" } }));
    await nodeishFs.writeFile("./de.yaml", YAML.dump({ language_zh_hans: "target" }));
    const settings = project({ keySeparator: "_" }, ["en", "de"]);

    await plugin.saveMessages!({
      messages: [message("language_zh_hans", { en: "new source", de: "new target" })],
      settings,
      nodeishFs,
    });

    expect(await readYaml(nodeishFs, "./en.yaml")).toEqual({ language: { zh_hans: "new source" } });
    expect(await readYaml(nodeishFs, "./de.yaml")).toEqual({ language_zh_hans: "new target" });
  });

  it("uses the original source structure for a new locale while deleting the source variant", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", YAML.dump({
      problem: { list: { sort: { solved_asc: "source" } } },
    }));
    const settings = project({ keySeparator: "_" }, ["en", "de"]);

    await plugin.saveMessages!({
      messages: [message("problem_list_sort_solved_asc", { de: "target" })],
      settings,
      nodeishFs,
    });

    expect(await readYaml(nodeishFs, "./en.yaml")).toEqual({});
    expect(await readYaml(nodeishFs, "./de.yaml")).toEqual({
      problem: { list: { sort: { solved_asc: "target" } } },
    });
  });

  it("writes entirely new ambiguous IDs as literal root keys", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const settings = project({ keySeparator: "_" }, ["en", "de"]);
    const messages = [
      message("new_key_with_underscores", { en: "source", de: "target" }),
      message("new_key.with\\slash", { en: "literal source", de: "literal target" }),
    ];

    await plugin.saveMessages!({ messages, settings, nodeishFs });

    expect(await readYaml(nodeishFs, "./en.yaml")).toEqual({
      new_key_with_underscores: "source", "new_key.with\\slash": "literal source",
    });
    expect(await readYaml(nodeishFs, "./de.yaml")).toEqual({
      new_key_with_underscores: "target", "new_key.with\\slash": "literal target",
    });
    expect((await plugin.loadMessages!({ settings, nodeishFs })).map(({ id }) => id)).toEqual(
      messages.map(({ id }) => id)
    );
  });

  it("keeps source fallback paths separate for each namespace", async () => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./common-en.yaml", YAML.dump({ foo: { bar_baz: "common" } }));
    await nodeishFs.writeFile("./app-en.yaml", YAML.dump({ foo_bar: { baz: "app" } }));
    const settings = project({
      keySeparator: "_",
      pathPattern: { common: "./common-{languageTag}.yaml", app: "./app-{languageTag}.yaml" },
    }, ["en", "de"]);

    await plugin.saveMessages!({
      messages: [
        message("common:foo_bar_baz", { de: "common target" }),
        message("app:foo_bar_baz", { de: "app target" }),
      ],
      settings,
      nodeishFs,
    });

    expect(await readYaml(nodeishFs, "./common-de.yaml")).toEqual({ foo: { bar_baz: "common target" } });
    expect(await readYaml(nodeishFs, "./app-de.yaml")).toEqual({ foo_bar: { baz: "app target" } });
  });

  it("does not leak original paths between projects sharing the same file names", async () => {
    const firstFs = createNodeishMemoryFs();
    const secondFs = createNodeishMemoryFs();
    const first = { one_two: { three: "first" } };
    const second = { one: { two_three: "second" } };
    await firstFs.writeFile("./en.yaml", YAML.dump(first));
    await secondFs.writeFile("./en.yaml", YAML.dump(second));
    const settings = project();
    const firstMessages = await plugin.loadMessages!({ settings, nodeishFs: firstFs });
    const secondMessages = await plugin.loadMessages!({ settings, nodeishFs: secondFs });

    await plugin.saveMessages!({ messages: firstMessages, settings, nodeishFs: firstFs });
    await plugin.saveMessages!({ messages: secondMessages, settings, nodeishFs: secondFs });

    expect(await readYaml(firstFs, "./en.yaml")).toEqual(first);
    expect(await readYaml(secondFs, "./en.yaml")).toEqual(second);
  });

  it("does not read ignored invalid source YAML for fallback paths or overwrite it", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const ignored = "broken: [unterminated\n";
    await nodeishFs.writeFile("./en.yaml", ignored);
    await nodeishFs.writeFile("./de.yaml", "existing_key: target\n");
    const settings = project({ keySeparator: "_", ignore: ["en.yaml"] }, ["en", "de"]);

    expect((await plugin.loadMessages!({ settings, nodeishFs })).map(({ id }) => id)).toEqual(["existing_key"]);
    await plugin.saveMessages!({
      messages: [message("fresh_under", { en: "ignored", de: "new target" })],
      settings,
      nodeishFs,
    });

    expect(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" })).toBe(ignored);
    expect(await readYaml(nodeishFs, "./de.yaml")).toEqual({ fresh_under: "new target" });
  });

  it.each(["true", "42", "null"])("still rejects unsupported scalar %s", async (scalar) => {
    const nodeishFs = createNodeishMemoryFs();
    await nodeishFs.writeFile("./en.yaml", `group:\n  some_key: ${scalar}\n`);

    await expect(plugin.loadMessages!({ settings: project(), nodeishFs })).rejects.toThrow(
      /expected a string/i
    );
  });

  it("detects target path conflicts before writing any locale", async () => {
    const nodeishFs = createNodeishMemoryFs();
    const original = YAML.dump({ top_key: { child: "source child" }, unrelated: "original" });
    await nodeishFs.writeFile("./en.yaml", original);
    await nodeishFs.writeFile("./de.yaml", "{}\n");
    const settings = project({ keySeparator: "_" }, ["en", "de"]);

    await expect(plugin.saveMessages!({
      messages: [
        message("unrelated", { en: "changed" }),
        message("top_key_child", { de: "child" }),
        message("top_key", { de: "leaf" }),
      ],
      settings,
      nodeishFs,
    })).rejects.toThrow(/conflict/i);

    expect(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" })).toBe(original);
    expect(await nodeishFs.readFile("./de.yaml", { encoding: "utf-8" })).toBe("{}\n");
  });
});

describe("keySeparator settings schema", () => {
  it.each([undefined, ".", "_"])("accepts supported separator %j", (keySeparator) => {
    const settings = keySeparator === undefined
      ? { pathPattern: "./{languageTag}.yaml" }
      : { pathPattern: "./{languageTag}.yaml", keySeparator };
    expect(Value.Check(plugin.settingsSchema!, settings)).toBe(true);
  });

  it.each(["", "__", ":", false, null])("rejects unsupported separator %j", (keySeparator) => {
    expect(Value.Check(plugin.settingsSchema!, {
      pathPattern: "./{languageTag}.yaml", keySeparator,
    })).toBe(false);
  });
});
