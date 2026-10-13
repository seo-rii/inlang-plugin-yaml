/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
  Message,
  Variant,
  LanguageTag,
  Plugin,
  NodeishFilesystemSubset,
} from "@inlang/plugin";
import { PluginSettings } from "./settings.js";
import { flattenMessages, unflattenMessages } from "./keyPaths.js";
import { escapeRegExp, replaceAll } from "./utilities.js";
import YAML from 'js-yaml';

const id = "plugin.inlang.yaml";

export const plugin: Plugin<{
  [id]: PluginSettings;
}> = {
  id,
  displayName: "YAML",
  description: "Plugin for YAML files",
  settingsSchema: PluginSettings,
  loadMessages: async ({ settings, nodeishFs }) => {
    settings[id].variableReferencePattern = settings[id]
      .variableReferencePattern || ["{", "}"];
    return loadMessages({
      nodeishFs,
      pluginSettings: settings[id],
      languageTags: settings.languageTags,
      sourceLanguageTag: settings.sourceLanguageTag,
    });
  },
  saveMessages: async ({ messages, settings, nodeishFs }) => {
    settings[id].variableReferencePattern = settings[id]
      .variableReferencePattern || ["{", "}"];
    return saveMessages({
      nodeishFs,
      pluginSettings: settings[id],
      messages,
      languageTags: settings.languageTags,
      sourceLanguageTag: settings.sourceLanguageTag,
    });
  },
};

/**
 * Load messages
 *
 * @example const messages = await loadMessages({ fs, settings, languageTags })
 */
async function loadMessages(args: {
  nodeishFs: NodeishFilesystemSubset;
  pluginSettings: PluginSettings;
  languageTags: Readonly<LanguageTag[]>;
  sourceLanguageTag: string;
}): Promise<Message[]> {
  const messages: Message[] = [];
  for (const languageTag of resolveOrderOfLanguageTags(
    args.languageTags,
    args.sourceLanguageTag
  )) {
    if (typeof args.pluginSettings.pathPattern !== "string") {
      for (const [prefix, path] of Object.entries(
        args.pluginSettings.pathPattern
      )) {
        if (isIgnoredPath(path, languageTag, args.pluginSettings.ignore)) continue;
        const messagesFromFile = await getFileToParse(
          path,
          languageTag,
          args.sourceLanguageTag,
          args.nodeishFs
        );
        for (const [key, value] of Object.entries(messagesFromFile)) {
          if (typeof value === "string") {
            const prefixedKey = prefix + ":" + key;
            addVariantToMessages(
              messages,
              prefixedKey,
              languageTag,
              value,
              args.pluginSettings
            );
          }
        }
      }
    } else {
      if (isIgnoredPath(args.pluginSettings.pathPattern, languageTag, args.pluginSettings.ignore)) continue;
      const messagesFromFile = await getFileToParse(
        args.pluginSettings.pathPattern,
        languageTag,
        args.sourceLanguageTag,
        args.nodeishFs
      );
      for (const [key, value] of Object.entries(messagesFromFile)) {
        if (typeof value === "string") {
          addVariantToMessages(
            messages,
            key,
            languageTag,
            value,
            args.pluginSettings
          );
        }
      }
    }
  }
  return messages;
}

function isIgnoredPath(
  path: string,
  languageTag: LanguageTag,
  ignore: PluginSettings["ignore"]
): boolean {
  const resolvedPath = replaceAll(path, "{languageTag}", languageTag).replace(/^(?:\.\/)+/, "");
  return ignore?.some((ignoredPath) =>
    replaceAll(ignoredPath, "{languageTag}", languageTag).replace(/^(?:\.\/)+/, "") === resolvedPath
  ) ?? false;
}

/**
 * Get file to parse
 *
 * To get files and throw if files are not there. Also handles the flattening for nested files
 *
 * @example const storedMessages = await getFileToParse(path, isNested, languageTag, fs)
 */
async function getFileToParse(
  path: string,
  languageTag: string,
  sourceLanguageTag: string,
  nodeishFs: NodeishFilesystemSubset
): Promise<Record<string, unknown>> {
  const pathWithLanguage = path.replace("{languageTag}", languageTag);
  // get file, make sure that is not braking when the namespace doesn't exist in every languageTag dir
  try {
    const file = await nodeishFs.readFile(pathWithLanguage, {
      encoding: "utf-8",
    });
    // analyze format of file

    let hasContent = false;
    const loaded = YAML.load(file, {
      filename: pathWithLanguage,
      listener: (event, state) => {
        if (event === "close" && state.kind !== null) hasContent = true;
      },
    });
    const yaml = loaded == null && !hasContent ? {} : loaded;
    if (
      yaml === null ||
      typeof yaml !== "object" ||
      Array.isArray(yaml) ||
      (Object.getPrototypeOf(yaml) !== Object.prototype && Object.getPrototypeOf(yaml) !== null)
    ) {
      throw new Error(
        `Invalid YAML document in ${JSON.stringify(pathWithLanguage)}: expected a mapping of message keys.`
      );
    }

    for (const [key, value] of Object.entries(yaml)) {
      validateMessageValue(value, [key], pathWithLanguage);
    }

    return flattenMessages(yaml as Record<string, unknown>, pathWithLanguage);
  } catch (e) {
    // if the namespace doesn't exist for this dir -> continue
    if ((e as any).code === "FileNotFound" || (e as any).code === "ENOENT") {
      // file does not exist yet
      return {};
    }
    throw e;
  }
}

function validateMessageValue(
  value: unknown,
  keyPath: string[],
  filePath: string,
  ancestors = new Set<object>()
): void {
  if (typeof value === "string") return;

  if (
    value !== null &&
    typeof value === "object" &&
    (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    if (ancestors.has(value)) {
      throw new Error(
        `Circular YAML alias in ${JSON.stringify(filePath)} at ${JSON.stringify(keyPath)}.`
      );
    }
    ancestors.add(value);
    for (const [key, child] of Object.entries(value)) {
      validateMessageValue(child, [...keyPath, key], filePath, ancestors);
    }
    ancestors.delete(value);
    return;
  }

  const received = value === null ? "null" :
    typeof value === "object" ? Object.prototype.toString.call(value) : typeof value;
  throw new Error(
    `Unsupported YAML message value in ${JSON.stringify(filePath)} at ${JSON.stringify(keyPath)}: expected a string, received ${received}.`
  );
}

/**
 * Resolve order of languageTags, move sourceLanguage to the first spot
 */
const resolveOrderOfLanguageTags = (
  languageTags: Readonly<LanguageTag[]>,
  sourceLanguageTag: LanguageTag
): LanguageTag[] => {
  const filteredTags = languageTags.filter((t) => t !== sourceLanguageTag); // Remove sourceLanguageTag
  filteredTags.unshift(sourceLanguageTag); // Add sourceLanguageTag to the beginning of the filtered array
  return filteredTags;
};

/**
 * Add new item (message, variant) to the ast
 *
 * @example addVariantToMessages(messages, key, languageTag, value)
 */
const addVariantToMessages = (
  messages: Message[],
  key: string,
  languageTag: LanguageTag,
  value: string,
  settings: PluginSettings
) => {
  const messageIndex = messages.findIndex((m) => m.id === key);
  if (messageIndex !== -1) {
    const variant: Variant = {
      languageTag,
      match: [],
      pattern: parsePattern(value, settings.variableReferencePattern!),
    };

    //push new variant
    messages[messageIndex]?.variants.push(variant);
  } else {
    // message does not exist
    const message: Message = {
      id: key,
      alias: {},
      selectors: [],
      variants: [],
    };
    message.variants = [
      {
        languageTag,
        match: [],
        pattern: parsePattern(value, settings.variableReferencePattern!),
      },
    ];
    messages.push(message);
  }
};

/**
 * Parses a pattern.
 *
 * @example parsePattern("Hello {name}!", ["{", "}"])
 */
function parsePattern(
  text: string,
  variableReferencePattern: string[]
): Variant["pattern"] {
  const [opening, closing] = variableReferencePattern;
  const escapedClosing = closing ? escapeRegExp(closing) : undefined;
  const expression = new RegExp(
    closing
      ? `${escapeRegExp(opening!)}((?:(?!${escapedClosing})[\\s\\S])+)${escapedClosing}`
      : `${escapeRegExp(opening!)}(\\w+)`,
    "g"
  );
  const pattern: Variant["pattern"] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index!;
    if (index > lastIndex) {
      pattern.push({ type: "Text", value: text.slice(lastIndex, index) });
    }
    pattern.push({ type: "VariableReference", name: match[1]! });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    pattern.push({ type: "Text", value: text.slice(lastIndex) });
  }
  return pattern;
}

/**
 * Save messages
 *
 * @example await saveMessages({ fs, settings, messages })
 */
async function saveMessages(args: {
  nodeishFs: NodeishFilesystemSubset;
  pluginSettings: PluginSettings;
  messages: Message[];
  languageTags: Readonly<LanguageTag[]>;
  sourceLanguageTag: LanguageTag;
}) {
  const languageTags = new Set([
    args.sourceLanguageTag,
    ...args.languageTags,
    ...args.messages.flatMap((message) =>
      message.variants.map((variant) => variant.languageTag)
    ),
  ]);
  const pathPatterns = typeof args.pluginSettings.pathPattern === "string"
    ? [["", args.pluginSettings.pathPattern] as const]
    : Object.entries(args.pluginSettings.pathPattern);
  const outputPaths = new Map<string, string>();
  for (const languageTag of languageTags) {
    for (const [namespace, pattern] of pathPatterns) {
      const path = pattern.replace("{languageTag}", languageTag);
      const absolute = path.startsWith("/");
      const segments: string[] = [];
      for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") {
          if (segments.length > 0 && segments[segments.length - 1] !== "..") {
            segments.pop();
          } else if (!absolute) {
            segments.push(segment);
          }
        } else {
          segments.push(segment);
        }
      }
      const normalizedPath = (absolute ? "/" : "") + segments.join("/") || ".";
      const target = `${namespace ? `namespace ${JSON.stringify(namespace)}, ` : ""}language ${JSON.stringify(languageTag)}`;
      const previous = outputPaths.get(normalizedPath);
      if (previous !== undefined) {
        throw new Error(
          `Duplicate YAML output path ${JSON.stringify(normalizedPath)}: ${previous} and ${target} resolve to the same file. Configure a distinct path for each namespace and language.`
        );
      }
      outputPaths.set(normalizedPath, target);
    }
  }

  if (typeof args.pluginSettings.pathPattern === "object") {
    // with namespaces
    const storage: Record<
      LanguageTag,
      Record<string, Record<Message["id"], Variant["pattern"]>>
    > = Object.create(null);
    for (const languageTag of resolveOrderOfLanguageTags(
      args.languageTags,
      args.sourceLanguageTag
    )) {
      storage[languageTag] = Object.create(null);
      for (const prefix of Object.keys(args.pluginSettings.pathPattern)) {
        storage[languageTag]![prefix] = Object.create(null);
      }
    }
    for (const message of args.messages) {
      for (const variant of message.variants) {
        const prefix: string = message.id.includes(":")
          ? (message.id.split(":")[0] as string)
          : (Object.keys(args.pluginSettings.pathPattern)[0] as string);
        const resolvedId = message.id.replace(prefix + ":", "");

        storage[variant.languageTag] ??= Object.create(null);
        storage[variant.languageTag]![prefix] ??= Object.create(null);
        storage[variant.languageTag]![prefix]![resolvedId] = variant.pattern;
      }
    }
    for (const [languageTag, _value] of Object.entries(storage)) {
      for (const [prefix, value] of Object.entries(_value)) {
        if (isIgnoredPath(args.pluginSettings.pathPattern[prefix] as string, languageTag, args.pluginSettings.ignore)) continue;
        const pathWithLanguage = (
          args.pluginSettings.pathPattern[prefix] as string
        ).replace("{languageTag}", languageTag);
        if (Object.keys(value).length === 0) {
          try {
            await args.nodeishFs.readFile(pathWithLanguage, { encoding: "utf-8" });
          } catch (error) {
            if (
              (error as any).code === "FileNotFound" ||
              (error as any).code === "ENOENT"
            ) {
              continue;
            }
            throw error;
          }
        }
        // check if directory exists
        const directoryPath = pathWithLanguage
          .split("/")
          .slice(0, -1)
          .join("/");
        try {
          await args.nodeishFs.readdir(directoryPath);
        } catch (error) {
          if (
            (error as any).code !== "FileNotFound" &&
            (error as any).code !== "ENOENT"
          ) {
            throw error;
          }
          await args.nodeishFs.mkdir(directoryPath, { recursive: true });
        }

        await args.nodeishFs.writeFile(
          pathWithLanguage,
          serializeFile(value, args.pluginSettings.variableReferencePattern)
        );
      }
    }
  } else {
    // without namespaces
    const storage: Record<LanguageTag, Record<Message["id"], Variant["pattern"]>> =
      Object.create(null);
    for (const languageTag of resolveOrderOfLanguageTags(
      args.languageTags,
      args.sourceLanguageTag
    )) {
      storage[languageTag] = Object.create(null);
    }
    for (const message of args.messages) {
      for (const variant of message.variants) {
        storage[variant.languageTag] ??= Object.create(null);
        storage[variant.languageTag]![message.id] = variant.pattern;
      }
    }
    for (const [languageTag, value] of Object.entries(storage)) {
      const pathWithLanguage = args.pluginSettings.pathPattern.replace(
        "{languageTag}",
        languageTag
      );
      if (isIgnoredPath(pathWithLanguage, languageTag, args.pluginSettings.ignore)) continue;
      if (Object.keys(value).length === 0) {
        try {
          await args.nodeishFs.readFile(pathWithLanguage, { encoding: "utf-8" });
        } catch (error) {
          if (
            (error as any).code === "FileNotFound" ||
            (error as any).code === "ENOENT"
          ) {
            continue;
          }
          throw error;
        }
      }
      try {
        await args.nodeishFs.readdir(
          pathWithLanguage.split("/").slice(0, -1).join("/")
        );
      } catch (error) {
        if (
          (error as any).code !== "FileNotFound" &&
          (error as any).code !== "ENOENT"
        ) {
          throw error;
        }
        await args.nodeishFs.mkdir(
          pathWithLanguage.split("/").slice(0, -1).join("/"),
          {
            recursive: true,
          }
        );
      }

      await args.nodeishFs.writeFile(
        pathWithLanguage,
        serializeFile(value, args.pluginSettings.variableReferencePattern)
      );
    }
  }
}

/**
 * Serializes file
 *
 * For all messages that belong in one file.
 *
 * @example const serializedFile = serializeFile(messages, space, endsWithNewLine, nested, variableReferencePattern)
 */
function serializeFile(
  messages: Record<Message["id"], Variant["pattern"]>,
  variableReferencePattern: PluginSettings["variableReferencePattern"]
): string {
  const result: Record<string, string> = Object.create(null);
  for (const [messageId, pattern] of Object.entries(messages)) {
    result[messageId] = serializePattern(pattern, variableReferencePattern!);
  }
  return YAML.dump(unflattenMessages(result));
}

/**
 * Serializes a pattern.
 *
 * @example const serializedPattern = serializePattern(pattern, variableReferencePattern)
 */
function serializePattern(
  pattern: Variant["pattern"],
  variableReferencePattern: string[]
) {
  const result: string[] = [];
  for (const element of pattern) {
    switch (element.type) {
      case "Text":
        result.push(element.value);
        break;
      case "VariableReference":
        result.push(
          variableReferencePattern[1]
            ? `${variableReferencePattern[0]}${element.name}${variableReferencePattern[1]}`
            : `${variableReferencePattern[0]}${element.name}`
        );
        break;
      default:
        throw new Error(
          `Unknown message pattern element of type: ${(element as any)?.type}`
        );
    }
  }
  return result.join("");
}
