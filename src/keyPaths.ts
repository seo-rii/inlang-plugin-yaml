import type { PluginSettings } from "./settings.js";

type KeySeparator = NonNullable<PluginSettings["keySeparator"]>;
type MessageEntry = { path: string[]; value: string };

/** Keep original paths alongside IDs so underscore IDs need not be split on save. */
export function collectMessages(
  value: Record<string, unknown>,
  source = "YAML document",
  keySeparator: KeySeparator = "."
): Map<string, MessageEntry> {
  const messages = new Map<string, MessageEntry>();
  function visit(mapping: Record<string, unknown>, parent: string[]) {
    for (const [key, child] of Object.entries(mapping)) {
      const path = [...parent, key];
      const id = keySeparator === "_"
        ? path.join("_")
        : path.map((segment) => segment.replace(/[\\.]/g, "\\$&")).join(".");
      if (typeof child === "string") {
        const previous = messages.get(id);
        if (previous) {
          throw new Error(
            `Ambiguous YAML message ID ${JSON.stringify(id)} in ${source}: ${JSON.stringify(previous.path)} and ${JSON.stringify(path)} use the same key separator.`
          );
        }
        messages.set(id, { path, value: child });
      } else if (Array.isArray(child)) {
        throw new TypeError(`YAML sequences are not supported in ${source} at ${id}`);
      } else if (child !== null && typeof child === "object") {
        visit(child as Record<string, unknown>, path);
      } else {
        throw new TypeError(`Expected a string translation at ${id}`);
      }
    }
  }
  visit(value, []);
  return messages;
}

export function flattenMessages(
  value: Record<string, unknown>,
  source = "YAML document",
  keySeparator: KeySeparator = "."
): Record<string, string> {
  const messages: Record<string, string> = Object.create(null);
  for (const [id, entry] of collectMessages(value, source, keySeparator)) {
    messages[id] = entry.value;
  }
  return messages;
}

export function unflattenMessages(
  messages: Record<string, string>,
  keySeparator: KeySeparator = ".",
  originalPaths: ReadonlyMap<string, readonly string[]> = new Map()
): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  for (const [id, value] of Object.entries(messages)) {
    // Underscores may belong to a literal key. For an unknown ID, a flat key
    // retains the ID without guessing which underscores used to be boundaries.
    const path = keySeparator === "_" ? [...(originalPaths.get(id) ?? [id])] : [""];
    if (keySeparator === ".") {
      let escaped = false;
      for (const character of id) {
        if (escaped) {
          if (character !== "." && character !== "\\") {
            throw new Error(`Invalid key escape in message ID ${JSON.stringify(id)}`);
          }
          path[path.length - 1] += character;
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === ".") {
          path.push("");
        } else {
          path[path.length - 1] += character;
        }
      }
      if (escaped) {
        throw new Error(`Incomplete key escape in message ID ${JSON.stringify(id)}`);
      }
    }

    let node = result;
    for (const [index, key] of path.entries()) {
      if (index === path.length - 1) {
        if (Object.hasOwn(node, key)) {
          throw new Error(`Conflicting YAML key path for message ID ${JSON.stringify(id)}`);
        }
        node[key] = value;
      } else {
        if (!Object.hasOwn(node, key)) node[key] = Object.create(null);
        const child = node[key];
        if (typeof child !== "object" || child === null) {
          throw new Error(`Conflicting YAML key path for message ID ${JSON.stringify(id)}`);
        }
        node = child as Record<string, unknown>;
      }
    }
  }
  return result;
}
