// pluginOptions for yaml plugin
import { Type, type Static } from "@sinclair/typebox";
const PathPattern = Type.String({
  pattern: "^(?![\\s\\S]*[\\r\\n])(?:\\./|\\.\\./|/)[^*?\\[\\]{}]*\\{languageTag\\}[^*?\\[\\]{}]*\\.yaml$",
  title: "Path to language files",
  description:
    "Specify a literal path to language files in your repository. It must contain exactly one `{languageTag}`, end with `.yaml`, and contain no glob patterns.",
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
        pattern: "^[^.:]+$",
        description: "Namespace names must be nonempty and cannot contain dots or colons.",
        examples: ["website", "app", "homepage"],
      }),
      PathPattern,
      { minProperties: 1, additionalProperties: false },
    ),
  ]),
  variableReferencePattern: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 2,
      title: "Variable reference pattern",
      description:
        "Literal delimiters for variable references. Define an opening delimiter and an optional closing delimiter. The default is '{' and '}'.",
      examples: [["{", "}"], ["{{", "}}"], ["<", ">"], ["@:"]],
    }),
  ),
  ignore: Type.Optional(
    Type.Array(Type.String(), {
      title: "Ignore paths",
      description:
        "Exact file paths to exclude from both loading and saving. `{languageTag}` is replaced for each language, and a leading `./` is optional. Glob patterns are not supported.",
    }),
  ),
});
