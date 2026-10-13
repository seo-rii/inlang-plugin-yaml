import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { PluginSettings } from "./settings.js";

const pathPattern = "./{languageTag}.yaml";

describe("supported YAML plugin settings", () => {
  it.each([
    "./{languageTag}.yaml",
    "../locales/{languageTag}/messages.yaml",
    "../../locales/{languageTag}/messages.yaml",
    "/locales/{languageTag}.yaml",
  ])("accepts literal locale path %j", (pathPattern) => {
    expect(Value.Check(PluginSettings, { pathPattern })).toBe(true);
  });

  it.each([
    "./{languageTag}.yaml.bak",
    "./{languageTag}.yaml\n",
    "./{languageTag}.yaml\r\n",
    "./{languageTag}/{languageTag}.yaml",
    "./{languageTag}/*.yaml",
    "./{languageTag}/?.yaml",
    "./{languageTag}/[ab].yaml",
    "./{languageTag}/{one,two}.yaml",
    "./{languageTag}/{other}.yaml",
    "./messages.yaml",
  ])("rejects unsupported locale path %j", (pathPattern) => {
    expect(Value.Check(PluginSettings, { pathPattern })).toBe(false);
    expect(Value.Check(PluginSettings, { pathPattern: { common: pathPattern } })).toBe(false);
  });

  it("accepts named namespaces", () => {
    expect(Value.Check(PluginSettings, {
      pathPattern: { common: pathPattern, "app-ui": "../locales/{languageTag}/app.yaml" },
    })).toBe(true);
  });

  it.each(["", "app.common", "app:common"])("rejects unsupported namespace %j", (namespace) => {
    expect(Value.Check(PluginSettings, {
      pathPattern: { common: pathPattern, [namespace]: pathPattern },
    })).toBe(false);
  });

  it("rejects an empty namespace mapping", () => {
    expect(Value.Check(PluginSettings, { pathPattern: {} })).toBe(false);
  });

  it.each([["$"], ["{", "}"], ["%(", ")s"]])("accepts literal delimiters %j", (...delimiters) => {
    expect(Value.Check(PluginSettings, { pathPattern, variableReferencePattern: delimiters })).toBe(true);
  });

  it.each([
    { delimiters: [] },
    { delimiters: [""] },
    { delimiters: ["", "}"] },
    { delimiters: ["{", ""] },
    { delimiters: ["{", "}", "!"] },
  ])("rejects invalid delimiters $delimiters", ({ delimiters }) => {
    expect(Value.Check(PluginSettings, { pathPattern, variableReferencePattern: delimiters })).toBe(false);
  });

  it("accepts the documented defaults when delimiters are omitted", () => {
    expect(Value.Check(PluginSettings, { pathPattern })).toBe(true);
  });
});
