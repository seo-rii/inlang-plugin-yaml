# @seorii/inlang-plugin-yaml

## Unreleased

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

Literal dots and backslashes in YAML keys now have escaped message IDs. Reload
YAML resources when upgrading; persisted IDs may need migration. Saving
normalizes YAML formatting and does not preserve comments or anchor syntax.

## 0.0.1

Initial experimental YAML plugin. The earlier changelog copied from
`@inlang/plugin-json` did not describe releases of this package.
