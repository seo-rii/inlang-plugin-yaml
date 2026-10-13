# @seorii/inlang-plugin-yaml

## Unreleased

- Add optional `keySeparator: "_"` for Trinity-style message IDs; the default
  `"."` mode retains escaped dots and backslashes.
- Reject underscore ID collisions within a YAML file. Preserve each existing
  file's key paths and reuse source-first locale paths within the same namespace
  for new variants. Save completely new IDs as literal root keys.
- Verify underscore settings, nested IDs, literal keys, and saved key paths in
  the packed package's type and runtime smoke checks.
- Restore YAML fixtures, settings validation tests, and awaited round trips.
- Preserve empty string translations and report unsupported YAML values.
- Load empty/comment-only documents and validate document roots.
- Persist deletion of final messages, locale variants, and namespaces.
- Preserve literal escape-marker text, dotted keys, and backslashes without
  sharing nesting state between files.
- Preserve prototype-related keys using isolated dictionaries.
- Create namespace directories recursively and preserve filesystem errors.
- Parse adjacent variables and literal custom delimiters correctly.
- Validate path patterns, namespaces, and variable delimiter settings.
- Honor exact ignored paths during both loading and saving.
- Reject unsupported YAML sequences before they can be rewritten as mappings.
- Align Marketplace metadata with the scoped package and MIT license.
- Publish TypeScript declarations and validate the packed package.

### Compatibility

Changing `keySeparator` changes IDs and may require updates to stored messages
and application references. Underscore mode preserves literal underscores, dots,
and backslashes, so distinct YAML paths that produce the same ID must be resolved
before loading. It does not relax the requirement for string translation values;
unquoted booleans, numbers, and dates remain unsupported.

In the default dot mode, literal dots and backslashes in YAML keys now have
escaped message IDs. Reload YAML resources when upgrading; persisted IDs may
need migration. Saving normalizes YAML formatting and does not preserve comments
or anchor syntax.

## 0.0.1

Initial experimental YAML plugin. The earlier changelog copied from
`@inlang/plugin-json` did not describe releases of this package.
