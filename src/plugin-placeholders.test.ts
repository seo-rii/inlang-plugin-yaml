import { describe, expect, it } from "vitest";
import type { ProjectSettings, Variant } from "@inlang/sdk";
import { createNodeishMemoryFs } from "@lix-js/fs";
import YAML from "js-yaml";
import { plugin } from "./plugin.js";

async function parse(text: string, variableReferencePattern?: string[]) {
  const nodeishFs = createNodeishMemoryFs();
  await nodeishFs.writeFile("./en.yaml", YAML.dump({ greeting: text }));
  const settings = {
    sourceLanguageTag: "en",
    languageTags: ["en"],
    modules: [],
    "plugin.inlang.yaml": {
      pathPattern: "./{languageTag}.yaml",
      ...(variableReferencePattern === undefined ? {} : { variableReferencePattern }),
    },
  } satisfies ProjectSettings;
  const messages = await plugin.loadMessages!({ settings, nodeishFs });
  await plugin.saveMessages!({ messages, settings, nodeishFs });
  expect(YAML.load(await nodeishFs.readFile("./en.yaml", { encoding: "utf-8" }))).toEqual({
    greeting: text,
  });
  return messages[0]!.variants[0]!.pattern;
}

const variable = (name: string): Variant["pattern"][number] => ({ type: "VariableReference", name });
const literal = (value: string): Variant["pattern"][number] => ({ type: "Text", value });

describe("literal variable delimiters", () => {
  it("recognizes every adjacent placeholder", async () => {
    expect(await parse("{first}{middle}{last}")).toEqual([
      variable("first"), variable("middle"), variable("last"),
    ]);
  });

  it("preserves text surrounding adjacent placeholders", async () => {
    expect(await parse("Hello {first}{last}!")).toEqual([
      literal("Hello "), variable("first"), variable("last"), literal("!"),
    ]);
  });

  it.each(["$", ".", "*", "+", "?", "^", "[", "]", "(", ")", "{", "}", "|", "\\"])(
    "escapes opening-only delimiter %j",
    async (opening) => {
      expect(await parse(`Hello ${opening}first${opening}last!`, [opening])).toEqual([
        literal("Hello "), variable("first"), variable("last"), literal("!"),
      ]);
    }
  );

  it.each([
    [["{{", "}}"], "{{first}}{{last}}"],
    [["%(", ")s"], "%(first)s%(last)s"],
    [["$[", "]$"], "$[first]$$[last]$"],
    [[".*", "+?"], ".*first+?.*last+?"],
  ])("escapes both delimiters %j", async (delimiters, text) => {
    expect(await parse(text as string, delimiters as string[])).toEqual([
      variable("first"), variable("last"),
    ]);
  });

  it("matches a complete closing delimiter, not any of its characters", async () => {
    expect(await parse("<:first:name:>", ["<:", ":>"])).toEqual([variable("first:name")]);
  });

  it("preserves unmatched delimiters and literal text", async () => {
    expect(await parse("plain {unfinished")).toEqual([literal("plain {unfinished")]);
  });

  it("keeps empty reference syntax literal without consuming a following reference", async () => {
    expect(await parse("{}{name}")).toEqual([literal("{}"), variable("name")]);
    expect(await parse("{{}}{{name}}", ["{{", "}}"])).toEqual([
      literal("{{}}"), variable("name"),
    ]);
  });
});
