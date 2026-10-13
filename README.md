# YAML translation files for inlang

`@seorii/inlang-plugin-yaml` is an experimental plugin for reading and writing
YAML translation mappings. Its plugin ID is `plugin.inlang.yaml`.

## Configure a project

After publishing a package version, add its module URL and settings to your
inlang project. Replace `0.0.1` below with the published version you intend to use.
This repository targets the `@inlang/plugin` 2.4.14 API and tests against
`@inlang/sdk` 0.36.3.

```json
{
  "sourceLanguageTag": "en",
  "languageTags": ["en", "de"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@seorii/inlang-plugin-yaml@0.0.1/dist/index.js"
  ],
  "plugin.inlang.yaml": {
    "pathPattern": "./locales/{languageTag}.yaml"
  }
}
```

Paths must start with `./`, `../`, or `/`, contain exactly one `{languageTag}`,
and end with `.yaml`. Glob patterns are not supported.

For multiple files per language, use namespaces:

```json
{
  "pathPattern": {
    "common": "./locales/{languageTag}/common.yaml",
    "app": "./locales/{languageTag}/app.yaml"
  }
}
```

Namespace names must be nonempty and cannot contain `.` or `:`. Each
namespace/language combination must resolve to a distinct file; duplicate output
paths are rejected before files are written. A `greeting` key in the `common`
namespace has the message ID `common:greeting`.

## Messages and variables

```yaml
greeting: Hello {name}!
navigation:
  home: Home
optional_label: ""
version_label: "123"
enabled_label: "true"
```

String values, including empty strings and multiline strings, are supported.
Nested mappings become message paths. Quote numbers, booleans, and dates when
they are intended as translation text. Unsupported values produce an error
instead of being silently dropped.

The default variable delimiters are `["{", "}"]`. To use a different literal
pair, set `"variableReferencePattern": ["{{", "}}"]`, for example. A single
opening delimiter such as `["$"]` is also supported; the variable name then
consists of ASCII letters, digits, or underscores. Delimiters must be nonempty,
and the setting must contain one or two strings. Adjacent references such as
`{first}{last}` are supported. ICU plural/select expressions are not supported.

## Key paths and preservation

Dots separate nested key segments in message IDs. A literal dot in a YAML key
is escaped as `\.` in the ID, and a literal backslash is escaped as `\\`.

| YAML value | Message ID |
| --- | --- |
| `a: { b: Nested }` | `a.b` |
| `a.b: Flat` | `a\.b` |
| `trailing.: Text` | `trailing\.` |
| `a\b: Text` | `a\\b` |

These keys can coexist without losing translations. Each file retains its own
mapping structure, independent of other languages, namespaces, or previously
loaded projects. When upgrading from the original experimental implementation,
reload the YAML files to obtain the escaped IDs; previously stored IDs containing
literal dots or backslashes may need migration.

Saving receives the complete message collection. Removing the last message in an
existing file writes an empty mapping, so deleted translations do not reappear.
Missing empty locale files are not created. Parent directories are created when
new translations need a file.

Supported documents have a mapping at the root. Missing, empty, and comment-only
files load as no messages. Empty mapping branches do not create messages.
Sequences (arrays), non-string scalar values, and cyclic aliases are rejected.
Acyclic aliases are expanded into their mapping/string values. Saving normalizes
YAML formatting; comments, anchor syntax, quote style, and indentation are not
preserved.

## Ignore files

`ignore` excludes exact file paths from both loading and saving:

```json
{
  "pathPattern": "./locales/{languageTag}.yaml",
  "ignore": ["./locales/de.yaml"]
}
```

A leading `./` is optional in an ignore entry. `{languageTag}` is substituted for
each language, so `locales/{languageTag}.yaml` excludes all matching locale files.
Ignore entries are not globs, directory prefixes, or substring matches. Ignored
files are also left untouched when all messages are deleted.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:package
```

The production build emits the browser ESM bundle and TypeScript declarations
under `dist/`. `test:package` builds and packs the package, then checks its types
and runtime entry point in a temporary consumer using production dependencies.

License: MIT. See [LICENSE](./LICENSE).
