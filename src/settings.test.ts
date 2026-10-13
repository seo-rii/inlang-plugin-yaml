import { expect, test } from "vitest";
import { plugin } from "./plugin.js";
import { Value } from "@sinclair/typebox/value";

test("valid path patterns", async () => {
  const validPathPatterns = [
    "/folder/{languageTag}.yaml",
    "./{languageTag}/file.yaml",
    "../folder/{languageTag}/file.yaml",
    "./{languageTag}.yaml",
    "./{languageTag}/folder/file.yaml",
  ];

  for (const pathPattern of validPathPatterns) {
    const isValid = Value.Check(plugin.settingsSchema!, {
      pathPattern,
    });
    expect(isValid).toBe(true);
  }
});

test("rejects paths without an absolute or relative prefix", async () => {
  const pathPattern = "{languageTag}.yaml";

  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(false);
});
test("rejects paths without the languageTag placeholder", async () => {
  const pathPattern = "./examplePath.yaml";

  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(false);
});
test("rejects paths without a YAML extension", async () => {
  const pathPattern = "./{languageTag}.";

  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(false);
});
test("rejects paths with unsupported placeholders", async () => {
  const pathPattern = "./{en}.yaml";

  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(false);
});
test("rejects wildcard paths", async () => {
  const pathPattern = "./{languageTag}/*.yaml";
  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(false);
});
test("accepts valid namespace paths", async () => {
  const pathPattern = {
    website: "./{languageTag}examplerFolder/ExampleFile.yaml",
    app: "../{languageTag}examplerFolder/ExampleFile.yaml",
    footer: "./{languageTag}examplerFolder/ExampleFile.yaml",
  };
  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(true);
});

test("rejects invalid namespace paths", async () => {
  const pathPattern = {
    website: "./folder/file.yaml",
    app: "../{languageTag}folder/file.yaml",
    footer: "./{languageTag}folder/file.yaml",
  };
  const isValid = Value.Check(plugin.settingsSchema!, {
    pathPattern,
  });
  expect(isValid).toBe(false);
});
