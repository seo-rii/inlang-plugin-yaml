import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const temporary = mkdtempSync(join(tmpdir(), "inlang-plugin-yaml-package-"));

try {
  const [packed] = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--offline", "--json", "--pack-destination", temporary],
      { cwd: root, encoding: "utf8" },
    ),
  );
  assert(packed.files.some(({ path }) => path === pkg.types.replace(/^\.\//, "")));
  assert(!packed.files.some(({ path }) => /\.test\./.test(path)));

  const consumer = join(temporary, "consumer");
  const installedPackage = join(consumer, "node_modules", pkg.name);
  mkdirSync(installedPackage, { recursive: true });
  execFileSync("tar", ["-xzf", join(temporary, packed.filename), "--strip-components=1", "-C", installedPackage]);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));

  // Expose only declared production dependencies to this consumer. Reuse local
  // installations so this check never requires a network request or install.
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    const destination = join(consumer, "node_modules", dependency);
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(realpathSync(join(root, "node_modules", dependency)), destination, "dir");
  }
  assert(!existsSync(join(consumer, "node_modules", "@inlang/sdk")));

  // Match the project's library-check setting: this older TypeBox release has
  // declaration diagnostics under newer TypeScript. Resolve our declaration
  // imports explicitly so skipLibCheck cannot hide an undeclared dependency.
  for (const { path } of packed.files.filter(({ path }) => path.endsWith(".d.ts"))) {
    const declaration = join(installedPackage, path);
    const { importedFiles } = ts.preProcessFile(readFileSync(declaration, "utf8"));
    for (const { fileName } of importedFiles) {
      if (!fileName.startsWith(".")) {
        const dependency = fileName.startsWith("@")
          ? fileName.split("/").slice(0, 2).join("/")
          : fileName.split("/")[0];
        assert(Object.hasOwn(pkg.dependencies ?? {}, dependency), `Undeclared type dependency: ${fileName}`);
      }
      const { resolvedModule } = ts.resolveModuleName(fileName, declaration, {
        module: ts.ModuleKind.Node16,
        moduleResolution: ts.ModuleResolutionKind.Node16,
      }, ts.sys);
      assert(resolvedModule, `Unresolved packed declaration import: ${fileName}`);
    }
  }

  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    files: ["index.ts"],
  }));
  writeFileSync(join(consumer, "index.ts"), `
import plugin from ${JSON.stringify(pkg.name)};

type PluginIsAny = 0 extends (1 & typeof plugin) ? true : false;
const pluginHasTypes: PluginIsAny = false;
type LoadArgs = Parameters<NonNullable<typeof plugin.loadMessages>>[0];
const settings: LoadArgs["settings"] = {
  sourceLanguageTag: "en",
  languageTags: ["en"],
  modules: [],
  "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml" },
};
// @ts-expect-error Paths must remain typed strings or namespace records.
const invalidPath: LoadArgs["settings"]["plugin.inlang.yaml"]["pathPattern"] = 42;
const trinitySettings: LoadArgs["settings"] = {
  ...settings,
  "plugin.inlang.yaml": {
    pathPattern: "./locale/{languageTag}.yaml",
    keySeparator: "_",
  },
};
const dotSeparator: LoadArgs["settings"]["plugin.inlang.yaml"]["keySeparator"] = ".";
// @ts-expect-error Only dot and underscore key separators are supported.
const invalidSeparator: LoadArgs["settings"]["plugin.inlang.yaml"]["keySeparator"] = "/";
declare const nodeishFs: LoadArgs["nodeishFs"];
const messages = await plugin.loadMessages!({ settings, nodeishFs });
const messageId: string = messages[0]?.id ?? "";
await plugin.loadMessages!({ settings: trinitySettings, nodeishFs });
`);
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", consumer], {
    cwd: consumer,
    stdio: "inherit",
  });

  const trinitySource = [
    "language:",
    "  zh_hans: Simplified Chinese",
    "problem:",
    "  list:",
    "    sort:",
    "      solved_asc: Ascending",
    "literal_key: Literal underscore",
    "literal.dot: Literal dot",
    "literal\\key: Literal backslash",
    "",
  ].join("\n");
  writeFileSync(join(consumer, "smoke.mjs"), `
import assert from "node:assert/strict";
import YAML from "js-yaml";
import plugin from ${JSON.stringify(pkg.name)};
const messages = await plugin.loadMessages({
  settings: {
    sourceLanguageTag: "en",
    languageTags: ["en"],
    modules: [],
    "plugin.inlang.yaml": { pathPattern: "./{languageTag}.yaml" },
  },
  nodeishFs: { readFile: async () => "greeting: Hello\\n" },
});
assert.equal(messages[0].id, "greeting");
assert.deepEqual(messages[0].variants[0].pattern, [{ type: "Text", value: "Hello" }]);

const trinitySource = ${JSON.stringify(trinitySource)};
const files = new Map([["./locale/en.yaml", trinitySource]]);
const trinitySettings = {
  sourceLanguageTag: "en",
  languageTags: ["en"],
  modules: [],
  "plugin.inlang.yaml": {
    pathPattern: "./locale/{languageTag}.yaml",
    keySeparator: "_",
  },
};
const nodeishFs = {
  readFile: async (path) => {
    if (!files.has(path)) throw Object.assign(new Error("Missing file: " + path), { code: "ENOENT" });
    return files.get(path);
  },
  readdir: async () => [],
  mkdir: async () => undefined,
  writeFile: async (path, contents) => { files.set(path, contents); },
};
const trinityMessages = await plugin.loadMessages({ settings: trinitySettings, nodeishFs });
assert.deepEqual(trinityMessages.map((message) => message.id), [
  "language_zh_hans",
  "problem_list_sort_solved_asc",
  "literal_key",
  "literal.dot",
  ${JSON.stringify("literal\\key")},
]);
trinityMessages.push({
  id: "brand_new_key",
  alias: {},
  selectors: [],
  variants: [{ languageTag: "en", match: [], pattern: [{ type: "Text", value: "New" }] }],
});
await plugin.saveMessages({ settings: trinitySettings, nodeishFs, messages: trinityMessages });
assert.deepEqual(YAML.load(files.get("./locale/en.yaml")), {
  ...YAML.load(trinitySource),
  brand_new_key: "New",
});
const reloaded = await plugin.loadMessages({ settings: trinitySettings, nodeishFs });
assert.deepEqual(reloaded, trinityMessages);
`);
  execFileSync(process.execPath, [join(consumer, "smoke.mjs")], { cwd: consumer, stdio: "inherit" });
  console.log("Packed plugin resolves and type-checks with production dependencies only.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
