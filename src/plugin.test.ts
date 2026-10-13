/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, it, describe } from "vitest";
import type { PluginSettings } from "./settings.js";
import {
  type Message,
  type ProjectSettings,
  type Variant,
  createVariant,
  getVariant,
} from "@inlang/sdk";
import { plugin } from "./plugin.js";
import { createNodeishMemoryFs } from "@lix-js/fs";
import YAML from "js-yaml";

const pluginId = "plugin.inlang.yaml";

describe("loadMessage", () => {
  it("should return messages if the path pattern is valid", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", YAML.dump({ test: "Hello world" }));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const variant = getVariant(messages[0]!, { where: { languageTag: "en" } });
    expect(variant?.pattern[0]?.type).toBe("Text");
  });

  it("should work with empty YAML mappings", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", YAML.dump({}));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    await expect(
      plugin.loadMessages!({ settings, nodeishFs: fs }),
    ).resolves.toEqual([]);
  });

  it("should work with not yet existing files", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", YAML.dump({ test: "Hello world" }));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    await expect(
      plugin.loadMessages!({ settings, nodeishFs: fs }),
    ).resolves.toBeTruthy();
  });

  it("should add multiple variants to the same message", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", YAML.dump({ test: "Hello world" }));
    await fs.writeFile("./de.yaml", YAML.dump({ test: "Hallo welt" }));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } }),
    ).toBeTruthy();
    expect(
      getVariant(messages[0]!, { where: { languageTag: "de" } }),
    ).toBeTruthy();
  });

  // namespaces
  it("should return messages if the path pattern is valid (namespace)", async () => {
    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.writeFile(
      "./en/common.yaml",
      YAML.dump({ test: "Hello world" }),
    );

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const variant = getVariant(messages[0]!, { where: { languageTag: "en" } });
    expect(variant?.pattern[0]?.type).toBe("Text");
  });

  it("should work with empty YAML mappings (namespace)", async () => {
    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.writeFile("./en/common.yaml", YAML.dump({}));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    await expect(
      plugin.loadMessages!({ settings, nodeishFs: fs }),
    ).resolves.toEqual([]);
  });

  it("should work with not yet existing files (namespace)", async () => {
    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.writeFile(
      "./en/common.yaml",
      YAML.dump({ test: "Hello world" }),
    );

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    await expect(
      plugin.loadMessages!({ settings, nodeishFs: fs }),
    ).resolves.toBeTruthy();
  });

  it("should add multiple variants to the same message (namespace)", async () => {
    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.mkdir("./de");
    await fs.writeFile(
      "./en/common.yaml",
      YAML.dump({ test: "Hello world" }),
    );
    await fs.writeFile(
      "./de/common.yaml",
      YAML.dump({ test: "Hallo welt" }),
    );

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } }),
    ).toBeTruthy();
    expect(
      getVariant(messages[0]!, { where: { languageTag: "de" } }),
    ).toBeTruthy();
  });

  it("should not throw an error when load messages with empty namespaces", async () => {
    const test = YAML.dump({
      test: "test",
    });
    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.mkdir("./de");
    await fs.writeFile("./en/common.yaml", test);
    await fs.writeFile("./en/vital.yaml", test);
    await fs.writeFile("./de/common.yaml", test);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
          vital: "./{languageTag}/vital.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({ settings, nodeishFs: fs });
    expect(messages.map((message) => message.id)).toEqual(["common:test", "vital:test"]);
    expect(messages[0]?.variants.map((variant) => variant.languageTag)).toEqual(["en", "de"]);
    expect(messages[1]?.variants.map((variant) => variant.languageTag)).toEqual(["en"]);
  });

  it("should load both languages with a string path pattern", async () => {
    const test = YAML.dump({
      test: "test",
    });
    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.mkdir("./de");
    await fs.writeFile("./en/common.yaml", test);
    await fs.writeFile("./de/common.yaml", test);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}/common.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({ settings, nodeishFs: fs });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("test");
    expect(messages[0]?.variants.map((variant) => variant.languageTag)).toEqual(["en", "de"]);
  });

  it("should not throw an error when the path to the resources is not present", async () => {
    const fs = createNodeishMemoryFs();

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: "./lang/{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    await expect(
      plugin.loadMessages!({ settings, nodeishFs: fs }),
    ).resolves.toEqual([]);
  });
});

describe("saveMessage", () => {
  it("test string pathPattern", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", YAML.dump({}));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages: Message[] = [
      {
        id: "test",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "Hello world",
              },
            ],
          },
        ],
      },
    ];
    await plugin.saveMessages!({ messages, settings, nodeishFs: fs });
    expect(
      YAML.load(await fs.readFile("./en.yaml", { encoding: "utf-8" })),
    ).toEqual({ test: "Hello world" });
  });

  it("test object pathPattern", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", YAML.dump({}));

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages: Message[] = [
      {
        id: "common:test",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "Hello world",
              },
            ],
          },
        ],
      },
      {
        id: "common:test2",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "Hello world2",
              },
            ],
          },
        ],
      },
    ];
    await plugin.saveMessages!({ messages, settings, nodeishFs: fs });
    expect(
      YAML.load(await fs.readFile("./en/common.yaml", { encoding: "utf-8" })),
    ).toEqual({
      test: "Hello world",
      test2: "Hello world2",
    });
  });
});

describe("variable reference", () => {
  it("should correctly identify variable reference (at the end)", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile(
      "./en.yaml",
      YAML.dump({ test: "Hello {username}" }),
    );

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern
        .length,
    ).toBe(2);
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern[0]
        ?.type,
    ).toBe("Text");
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern[1]
        ?.type,
    ).toBe("VariableReference");
  });

  it("should correctly identify variable reference (at the beginning)", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile(
      "./en.yaml",
      YAML.dump({ test: "{username} the great" }),
    );

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern
        .length,
    ).toBe(2);
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern[0]
        ?.type,
    ).toBe("VariableReference");
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern[1]
        ?.type,
    ).toBe("Text");
  });

  it("should correctly apply the variableReferencePattern", async () => {
    const fs = createNodeishMemoryFs();
    await fs.writeFile(
      "./en.yaml",
      YAML.dump({ test: "Hello @username" }),
    );

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
        variableReferencePattern: ["@"],
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern[0]
        ?.type,
    ).toBe("Text");
    expect(
      getVariant(messages[0]!, { where: { languageTag: "en" } })?.pattern[1]
        ?.type,
    ).toBe("VariableReference");
  });
});

describe("YAML serialization", () => {
  it("should preserve messages from differently formatted YAML when adding a language", async () => {
    const plainScalar = "test: test\n";
    const quotedScalar = "test: 'test'\n";

    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", plainScalar);
    await fs.writeFile("./fr.yaml", plainScalar);
    await fs.writeFile("./de.yaml", quotedScalar);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de", "fr"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const variant: Variant = {
      languageTag: "es",
      match: [],
      pattern: [
        {
          type: "Text",
          value: "test",
        },
      ],
    };
    const newMessage = createVariant(messages[0]!, {
      data: variant,
    }).data;
    await plugin.saveMessages!({
      messages: [newMessage!],
      settings,
      nodeishFs: fs,
    });

    const file1 = await fs.readFile("./en.yaml", { encoding: "utf-8" });
    const file2 = await fs.readFile("./fr.yaml", { encoding: "utf-8" });
    const file3 = await fs.readFile("./de.yaml", { encoding: "utf-8" });
    const file4 = await fs.readFile("./es.yaml", { encoding: "utf-8" });

    expect(YAML.load(file1)).toEqual({ test: "test" });
    expect(YAML.load(file2)).toEqual({ test: "test" });
    expect(YAML.load(file3)).toEqual({ test: "test" });
    expect(YAML.load(file4)).toEqual({ test: "test" });
  });

  it("should preserve messages whether the input ends with a newline or not", async () => {
    const withNewLine = "test: test\n";
    const withoutNewLine = "test: test";

    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", withNewLine);
    await fs.writeFile("./fr.yaml", withoutNewLine);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de", "fr"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    await plugin.saveMessages!({ messages, settings, nodeishFs: fs });
    const file1 = await fs.readFile("./en.yaml", { encoding: "utf-8" });
    const file2 = await fs.readFile("./fr.yaml", { encoding: "utf-8" });
    expect(YAML.load(file1)).toEqual({ test: "test" });
    expect(YAML.load(file2)).toEqual({ test: "test" });
  });

  it("should escape `.` in flattened YAML structures", async () => {
    const enResource = "test.: test\ntest.test: test\n";

    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.writeFile("./en/common.yaml", enResource);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: { common: "./{languageTag}/common.yaml" },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const reference: Message[] = [
      {
        id: "common:test\\.",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "test",
              },
            ],
          },
        ],
      },
      {
        id: "common:test\\.test",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "test",
              },
            ],
          },
        ],
      },
    ];

    expect(messages).toStrictEqual(reference);
  });

  it("should escape `.` in nested YAML structures", async () => {
    const enResource = "a.:\n  b: test\nc.: test\n";

    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.writeFile("./en/common.yaml", enResource);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const reference: Message[] = [
      {
        id: "common:a\\..b",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "test",
              },
            ],
          },
        ],
      },
      {
        id: "common:c\\.",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "test",
              },
            ],
          },
        ],
      },
    ];
    expect(messages).toStrictEqual(reference);
    await plugin.saveMessages!({
      messages,
      settings,
      nodeishFs: fs,
    });
    const file = await fs.readFile("./en/common.yaml", { encoding: "utf-8" });
    expect(YAML.load(file)).toEqual({ "a.": { b: "test" }, "c.": "test" });
  });

  it("should handle empty objects correctly", async () => {
    const content = YAML.dump(
      {
        a: "test",
        b: {},
      },
      { indent: 2 },
    );
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", content);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });

    await plugin.saveMessages!({
      messages: messages,
      settings,
      nodeishFs: fs,
    });

    const newContent = await fs.readFile("./en.yaml", { encoding: "utf-8" });

    expect(YAML.load(newContent)).toEqual({ a: "test" });
  });

  it("should preserve nested messages when adding a language", async () => {
    const withNesting = YAML.dump(
      {
        test: {
          test: "test",
        },
      },
      { indent: 2 },
    );

    const fs = createNodeishMemoryFs();

    await fs.writeFile("./en.yaml", withNesting);
    await fs.writeFile("./fr.yaml", withNesting);
    await fs.writeFile("./de.yaml", withNesting);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en", "de", "fr"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });

    messages.push({
      id: "test.test",
      alias: {},
      selectors: [],
      variants: [
        {
          languageTag: "es",
          match: [],
          pattern: [
            {
              type: "Text",
              value: "test",
            },
          ],
        },
      ],
    });

    await plugin.saveMessages!({
      messages,
      settings,
      nodeishFs: fs,
    });

    const file1 = await fs.readFile("./en.yaml", { encoding: "utf-8" });
    const file2 = await fs.readFile("./fr.yaml", { encoding: "utf-8" });
    const file3 = await fs.readFile("./de.yaml", { encoding: "utf-8" });
    const file4 = await fs.readFile("./es.yaml", { encoding: "utf-8" });

    expect(YAML.load(file1)).toEqual({ test: { test: "test" } });
    expect(YAML.load(file2)).toEqual({ test: { test: "test" } });
    expect(YAML.load(file3)).toEqual({ test: { test: "test" } });
    expect(YAML.load(file4)).toEqual({ test: { test: "test" } });
  });
});

describe("roundTrip", () => {
  it("should serialize newly added messages", async () => {
    const enResource = "test: '{username}'\n";

    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", enResource);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: "./{languageTag}.yaml",
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const variant: Variant = {
      languageTag: "en",
      match: [],
      pattern: [
        {
          type: "Text",
          value: "This is new",
        },
      ],
    };
    const newMessage: Message = {
      id: "test2",
      alias: {},
      selectors: [],
      variants: [variant],
    };
    messages.push(newMessage);
    await plugin.saveMessages!({
      messages,
      settings,
      nodeishFs: fs,
    });
    const newFile = (await fs.readFile("./en.yaml", {
      encoding: "utf-8",
    })) as string;
    expect(YAML.load(newFile)).toEqual({ test: "{username}", test2: "This is new" });
  });

  it("should correctly parse resources with pathPattern that contain namespaces", async () => {
    const testResource = "test: test\n";

    const fs = createNodeishMemoryFs();
    await fs.mkdir("./en");
    await fs.writeFile("./en/common.yaml", testResource);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}/common.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    const reference: Message[] = [
      {
        id: "common:test",
        alias: {},
        selectors: [],
        variants: [
          {
            languageTag: "en",
            match: [],
            pattern: [
              {
                type: "Text",
                value: "test",
              },
            ],
          },
        ],
      },
    ];
    expect(messages).toStrictEqual(reference);
  });

  it("should successfully do a roundtrip with complex content", async () => {
    const complexContent = YAML.dump(
      {
        "//multiLineString": {
          multiline: "This is a\nmulti-line\nstring.",
        },
        unicodeCharacters: {
          emoji: "\uD83D\uDE00",
          currency: "€",
        },
        test: 'Single "quote" test',
      },
      { indent: 4 },
    );
    const fs = createNodeishMemoryFs();
    await fs.writeFile("./en.yaml", complexContent);

    const settings = {
      sourceLanguageTag: "en",
      languageTags: ["en"],
      modules: [],
      [pluginId]: {
        pathPattern: {
          common: "./{languageTag}.yaml",
        },
      } satisfies PluginSettings,
    } satisfies ProjectSettings;

    const messages = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    await plugin.saveMessages!({ messages, settings, nodeishFs: fs });
    const newMessage = await plugin.loadMessages!({
      settings,
      nodeishFs: fs,
    });
    expect(newMessage).toStrictEqual(messages);
  });
});
