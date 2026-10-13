/** Dots separate path segments; backslashes escape literal dots and backslashes. */
export function flattenMessages(
  value: Record<string, unknown>,
  source = "YAML document"
): Record<string, string> {
  const messages: Record<string, string> = Object.create(null);
  function visit(mapping: Record<string, unknown>, parent: string[]) {
    for (const [key, child] of Object.entries(mapping)) {
      const path = [...parent, key.replace(/[\\.]/g, "\\$&")];
      if (typeof child === "string") {
        messages[path.join(".")] = child;
      } else if (Array.isArray(child)) {
        throw new TypeError(`YAML sequences are not supported in ${source} at ${path.join(".")}`);
      } else if (child !== null && typeof child === "object") {
        visit(child as Record<string, unknown>, path);
      } else {
        throw new TypeError(`Expected a string translation at ${path.join(".")}`);
      }
    }
  }
  visit(value, []);
  return messages;
}

export function unflattenMessages(messages: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  for (const [id, value] of Object.entries(messages)) {
    const path = [""];
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
