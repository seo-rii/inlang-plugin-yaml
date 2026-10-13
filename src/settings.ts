// pluginOptions for yaml plugin
import { Type, type Static } from "@sinclair/typebox";
const PathPattern = Type.String({
  pattern: "^(\\./|\\../|/)[^*]*\\{languageTag\\}[^*]*\\.yaml",
  title: "Path to language files",
  description:
    "Specify the pathPattern to locate language files in your repository. It must include `{languageTag}` and end with `.yaml`.",
  examples: [
    "./{languageTag}/file.yaml",
    "../folder/{languageTag}/file.yaml",
    "./{languageTag}.yaml",
  ],
});
export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.Union([
    PathPattern,
    Type.Record(
      Type.String({
        pattern: "^[^.]+$",
        description: "Dots are not allowd ",
        examples: ["website", "app", "homepage"],
      }),
      PathPattern,
    ),
  ]),
  variableReferencePattern: Type.Optional(
    Type.Array(Type.String(), {
      title: "Variable reference pattern",
      description:
        "Literal delimiters for variable references. Define an opening delimiter and an optional closing delimiter. The default is '{' and '}'.",
      examples: [["{", "}"], ["{{", "}}"], ["<", ">"], ["@:"]],
    }),
  ),
  ignore: Type.Optional(
    Type.Array(Type.String(), {
      title: "Ignore paths",
      description: "Set a path that should be ignored.",
    }),
  ),
});
