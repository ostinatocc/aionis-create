#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AionisQuickstart = "sdk" | "http" | "multi-agent" | "none";

export type CreateAionisOptions = {
  dir: string;
  repo: string;
  branch: string | null;
  provider: string;
  apiKey: string | null;
  quickstart: AionisQuickstart;
  skipInstall: boolean;
  skipQuickstart: boolean;
  withAifs: boolean;
  withZvecAnn: boolean;
  zvecPath: string | null;
  withClaudeCode: boolean;
  claudeCodeDir: string | null;
  claudeCodeBaseUrl: string;
  claudeCodeScopeFrom: "workspace" | "git" | "cwd" | "none";
  claudeCodeMcpName: string;
  claudeCodeSkipMcp: boolean;
};

const DEFAULT_REPO = "https://github.com/ostinatocc/Aionis.git";
const DEFAULT_DIR = "Aionis";
const DEFAULT_CLAUDE_CODE_BASE_URL = "http://127.0.0.1:3101";
const MIN_NODE_VERSION = "22.5.0";
const require = createRequire(import.meta.url);

function usage(): string {
  return `Usage:
  npx @aionis/create [dir] [options]

Options:
  --dir <path>              Install directory. Defaults to ./Aionis.
  --repo <url>              Runtime git repo. Defaults to ${DEFAULT_REPO}
  --branch <name>           Git branch or tag to clone.
  --provider <name>         Embedding provider. Defaults to EMBEDDING_PROVIDER, a detected key, or none.
  --api-key <key>           Provider API key. Prefer env vars for shell history safety.
  --quickstart <name>       Advanced: sdk, http, multi-agent, or none. Defaults to none.
  --with-aifs               Print @aionis/aifs file-surface setup commands.
  --with-zvec-ann           Enable optional Zvec ANN candidate sidecar in Runtime .env.
  --zvec-path <path>        Optional Zvec index path. Defaults to Runtime's SQLite-derived path.
  --with-claude-code        Run Claude Code onboarding after Runtime install.
  --claude-code-dir <path>  Directory used as onboarding cwd. Defaults to current directory.
  --claude-code-base-url <url>
                            Runtime URL used by Claude Code hooks. Defaults to ${DEFAULT_CLAUDE_CODE_BASE_URL}.
  --claude-code-scope-from <workspace|git|cwd|none>
                            Scope strategy for Claude Code hooks. Defaults to workspace.
  --claude-code-mcp-name <name>
                            Claude MCP server name. Defaults to aionis-local.
  --claude-code-skip-mcp    Install hooks without running claude mcp add.
  --skip-install            Clone and write env, but do not run npm install.
  --skip-quickstart         Do not run the selected verification flow after install.
  -h, --help                Show help.

Common commands:
  npx @aionis/create
  OPENAI_API_KEY=... npx @aionis/create my-aionis --provider openai
  DASHSCOPE_API_KEY=... npx @aionis/create my-aionis --provider dashscope
  npx @aionis/create .aionis-runtime --with-claude-code --claude-code-dir .
`;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}

export function providerEnvKey(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "none") return "";
  if (normalized === "openai") return "OPENAI_API_KEY";
  if (normalized === "dashscope") return "DASHSCOPE_API_KEY";
  if (normalized === "minimax") return "MINIMAX_API_KEY";
  return `${normalized.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

export function defaultEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.EMBEDDING_PROVIDER?.trim();
  if (explicit) return explicit;
  if (env.OPENAI_API_KEY?.trim()) return "openai";
  if (env.DASHSCOPE_API_KEY?.trim()) return "dashscope";
  if (env.MINIMAX_API_KEY?.trim()) return "minimax";
  return "none";
}

export function quickstartScriptName(quickstart: AionisQuickstart): string | null {
  if (quickstart === "none") return null;
  return `runtime:quickstart:${quickstart}`;
}

export function quickstartRequiresEmbeddingKey(quickstart: AionisQuickstart): boolean {
  return quickstart !== "none";
}

function parseQuickstart(value: string): AionisQuickstart {
  if (
    value === "sdk"
    || value === "http"
    || value === "multi-agent"
    || value === "none"
  ) return value;
  throw new Error(`Unsupported quickstart "${value}". Use sdk, http, multi-agent, or none.`);
}

function parseClaudeCodeScopeFrom(value: string): CreateAionisOptions["claudeCodeScopeFrom"] {
  if (value === "workspace" || value === "git" || value === "cwd" || value === "none") return value;
  throw new Error(`Unsupported Claude Code scope source "${value}". Use workspace, git, cwd, or none.`);
}

export function parseCreateAionisArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CreateAionisOptions {
  let dir = DEFAULT_DIR;
  let repo = DEFAULT_REPO;
  let branch: string | null = null;
  let provider = defaultEmbeddingProvider(env);
  let apiKey: string | null = null;
  let quickstart: AionisQuickstart = "none";
  let skipInstall = false;
  let skipQuickstart = false;
  let withAifs = false;
  let withZvecAnn = false;
  let zvecPath: string | null = null;
  let withClaudeCode = false;
  let claudeCodeDir: string | null = null;
  let claudeCodeBaseUrl = env.AIONIS_CLAUDE_CODE_BASE_URL?.trim() || DEFAULT_CLAUDE_CODE_BASE_URL;
  let claudeCodeScopeFrom: CreateAionisOptions["claudeCodeScopeFrom"] = parseClaudeCodeScopeFrom(
    env.AIONIS_CLAUDE_CODE_SCOPE_FROM?.trim() || "workspace",
  );
  let claudeCodeMcpName = env.AIONIS_CLAUDE_CODE_MCP_NAME?.trim() || "aionis-local";
  let claudeCodeSkipMcp = false;
  let positionalDirSet = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage());
      process.exit(0);
    }
    if (arg === "--dir") {
      dir = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--repo") {
      repo = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--branch") {
      branch = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--provider") {
      provider = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--api-key") {
      apiKey = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--quickstart") {
      quickstart = parseQuickstart(readFlagValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--with-aifs") {
      withAifs = true;
      continue;
    }
    if (arg === "--with-zvec-ann") {
      withZvecAnn = true;
      continue;
    }
    if (arg === "--zvec-path") {
      zvecPath = readFlagValue(argv, i, arg);
      withZvecAnn = true;
      i += 1;
      continue;
    }
    if (arg === "--with-claude-code") {
      withClaudeCode = true;
      continue;
    }
    if (arg === "--claude-code-dir") {
      claudeCodeDir = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--claude-code-base-url") {
      claudeCodeBaseUrl = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--claude-code-scope-from") {
      claudeCodeScopeFrom = parseClaudeCodeScopeFrom(readFlagValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--claude-code-mcp-name") {
      claudeCodeMcpName = readFlagValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--claude-code-skip-mcp") {
      claudeCodeSkipMcp = true;
      continue;
    }
    if (arg === "--skip-install") {
      skipInstall = true;
      continue;
    }
    if (arg === "--skip-quickstart") {
      skipQuickstart = true;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option "${arg}"`);
    if (positionalDirSet) throw new Error(`Unexpected positional argument "${arg}"`);
    dir = arg;
    positionalDirSet = true;
  }

  return {
    dir,
    repo,
    branch,
    provider,
    apiKey,
    quickstart,
    skipInstall,
    skipQuickstart,
    withAifs,
    withZvecAnn,
    zvecPath,
    withClaudeCode,
    claudeCodeDir,
    claudeCodeBaseUrl,
    claudeCodeScopeFrom,
    claudeCodeMcpName,
    claudeCodeSkipMcp,
  };
}

function run(command: string, args: string[], cwd: string | null, env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, {
    cwd: cwd ?? undefined,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function ensureCommand(command: string): void {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error(`Required command not found: ${command}`);
}

function compareNodeVersion(actual: string, minimum: string): number {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10));
  const a = parse(actual);
  const b = parse(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = Number.isFinite(a[i]) ? a[i] : 0;
    const right = Number.isFinite(b[i]) ? b[i] : 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

function hasNodeSqliteSupport(): boolean {
  try {
    const mod = require("node:sqlite") as { DatabaseSync?: unknown };
    return typeof mod.DatabaseSync === "function";
  } catch {
    return false;
  }
}

function ensureNodeVersion(): void {
  if (compareNodeVersion(process.versions.node, MIN_NODE_VERSION) < 0) {
    throw new Error(`Aionis Lite requires Node >= ${MIN_NODE_VERSION}. Current Node is ${process.versions.node}.`);
  }
  if (!hasNodeSqliteSupport()) {
    throw new Error("Aionis Lite requires Node's built-in node:sqlite module. Upgrade to a Node 22 build that includes node:sqlite.");
  }
}

function nonEmptyDirectory(dir: string): boolean {
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

function upsertEnvLine(source: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`) || line.startsWith(`export ${key}=`)) {
      replaced = true;
      return `${key}=${JSON.stringify(value)}`;
    }
    return line;
  });
  if (!replaced) next.push(`${key}=${JSON.stringify(value)}`);
  return next.join(os.EOL).replace(/\n{3,}$/g, `${os.EOL}${os.EOL}`);
}

function localPortFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") return null;
    if (url.port) return url.port;
    if (url.protocol === "http:") return "80";
    if (url.protocol === "https:") return "443";
    return null;
  } catch {
    return null;
  }
}

export function writeRuntimeEnv(targetDir: string, options: CreateAionisOptions): {
  providerKey: string;
  apiKey: string | null;
  embeddingProvider: string;
} {
  const envPath = path.join(targetDir, ".env");
  const examplePath = path.join(targetDir, ".env.example");
  let source = "";
  if (fs.existsSync(envPath)) {
    source = fs.readFileSync(envPath, "utf8");
  } else if (fs.existsSync(examplePath)) {
    source = fs.readFileSync(examplePath, "utf8");
  }

  const providerKey = providerEnvKey(options.provider);
  const apiKey = providerKey ? options.apiKey ?? process.env[providerKey]?.trim() ?? null : null;
  source = upsertEnvLine(source, "EMBEDDING_PROVIDER", options.provider);
  if (options.withClaudeCode) {
    const port = localPortFromUrl(options.claudeCodeBaseUrl);
    if (port) source = upsertEnvLine(source, "PORT", port);
  }
  if (options.withZvecAnn) {
    source = upsertEnvLine(source, "RECALL_ANN_PROVIDER", "zvec");
    source = upsertEnvLine(source, "RECALL_ANN_REBUILD_ON_START", "true");
    if (options.zvecPath?.trim()) source = upsertEnvLine(source, "RECALL_ZVEC_PATH", options.zvecPath.trim());
  }
  if (apiKey) source = upsertEnvLine(source, providerKey, apiKey);
  fs.writeFileSync(envPath, source.endsWith(os.EOL) ? source : `${source}${os.EOL}`);
  fs.chmodSync(envPath, 0o600);
  return { providerKey, apiKey, embeddingProvider: options.provider };
}

export function quickstartRunEnv(
  options: CreateAionisOptions,
  targetDir: string,
  providerKey: string,
  apiKey: string | null,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    EMBEDDING_PROVIDER: options.provider,
  };
  if (apiKey) env[providerKey] = apiKey;
  return env;
}

export function createInstallPlan(options: CreateAionisOptions): string[] {
  const quickstart = quickstartScriptName(options.quickstart);
  return [
    `clone ${options.repo} -> ${options.dir}`,
    options.skipInstall ? "skip npm install" : "npm install",
    options.skipInstall ? "skip Runtime build" : "npm run -s build",
    options.withAifs
      ? "print AIFS file-surface setup commands"
      : "skip AIFS file surface",
    options.withZvecAnn
      ? `enable Zvec ANN sidecar${options.zvecPath ? ` at ${options.zvecPath}` : ""}`
      : "skip Zvec ANN sidecar",
    options.skipQuickstart || !quickstart ? "skip verification flow" : `npm run -s ${quickstart}`,
    options.withClaudeCode
      ? `install Claude Code hooks in ${options.claudeCodeDir ?? process.cwd()} -> ${options.claudeCodeBaseUrl}`
      : "skip Claude Code hooks",
  ];
}

export function createClaudeCodeInstallCommand(options: CreateAionisOptions, cwd = process.cwd()): {
  command: string;
  args: string[];
  cwd: string;
} {
  const targetCwd = path.resolve(cwd, options.claudeCodeDir ?? ".");
  const args = [
    "exec",
    "--yes",
    "--package",
    "@aionis/claude-code@latest",
    "--",
    "aionis-claude-code",
    "install",
    "--base-url",
    options.claudeCodeBaseUrl,
    "--scope-from",
    options.claudeCodeScopeFrom,
    "--mcp-name",
    options.claudeCodeMcpName,
  ];
  if (options.claudeCodeSkipMcp) args.push("--skip-mcp");
  return { command: "npm", args, cwd: targetCwd };
}

export function createCompletionMessage(input: {
  targetDir: string;
  providerKey: string;
  apiKey: string | null;
  quickstartScript: string | null;
  withAifs?: boolean;
  runtimeBaseUrl?: string;
  quickstartRequiresEmbeddingKey?: boolean;
  embeddingProvider?: string;
  withZvecAnn?: boolean;
  zvecPath?: string | null;
}): string {
  const runtimeBaseUrl = input.runtimeBaseUrl ?? "http://127.0.0.1:3001";
  const aifsLines = input.withAifs
    ? [
      "AIFS package: @aionis/aifs",
      "AIFS file surface from an agent project:",
      `  npx @aionis/aifs@latest init --base-url ${runtimeBaseUrl} --scope my-project`,
      `  npx @aionis/aifs@latest doctor --base-url ${runtimeBaseUrl} --scope my-project`,
      `  npx @aionis/aifs@latest refresh --base-url ${runtimeBaseUrl} --scope my-project`,
    ]
    : ["AIFS package: @aionis/aifs"];
  const runtimeLines = [
    `Runtime directory: ${input.targetDir}`,
    `Start Runtime: cd ${input.targetDir} && npm run -s lite:start`,
    `Health check: curl ${runtimeBaseUrl}/health`,
    "Agent integration:",
    `  SDK / HTTP base URL: ${runtimeBaseUrl}`,
    `  SDK: createAionisClient({ baseUrl: "${runtimeBaseUrl}" })`,
    "  HTTP: POST /v1/observe -> POST /v1/guide -> POST /v1/feedback -> POST /v1/measure",
    `  MCP: npx @aionis/mcp@latest --base-url ${runtimeBaseUrl} --scope-from workspace`,
    `  AIFS: npx @aionis/aifs@latest refresh --base-url ${runtimeBaseUrl} --scope my-project`,
  ];
  if (!input.apiKey) {
    const quickstartNeedsKey = input.quickstartRequiresEmbeddingKey ?? true;
    const noKeyRuntimeReady = input.embeddingProvider === "none";
    const lines = [
      "",
      noKeyRuntimeReady
        ? "Aionis is installed."
        : quickstartNeedsKey
        ? "Aionis is installed. Add your embedding key before using stored-memory recall."
        : "Aionis is installed.",
      ...runtimeLines,
      noKeyRuntimeReady
        ? "Stored-memory semantic recall: set EMBEDDING_PROVIDER=openai|dashscope|minimax plus the matching API key in .env."
        : `Required key for stored-memory recall: ${input.providerKey}`,
      noKeyRuntimeReady
        ? `Config file: ${path.join(input.targetDir, ".env")}`
        : `Set it in: ${path.join(input.targetDir, ".env")}`,
      ...(noKeyRuntimeReady ? [] : [
        `Set: ${input.providerKey}="your-key"`,
      ]),
      "SDK package: @aionis/sdk",
      "MCP package: @aionis/mcp",
      "Claude Code hooks package: @aionis/claude-code",
      ...(input.withZvecAnn ? zvecCompletionLines(input.targetDir, input.zvecPath) : []),
      ...aifsLines,
    ];
    if (input.quickstartScript && quickstartNeedsKey) {
      lines.push(
        noKeyRuntimeReady
          ? `Selected verification flow was not run. Configure semantic recall first, then run: npm run -s ${input.quickstartScript}`
          : `Selected verification flow was not run. Set the key first, then run: npm run -s ${input.quickstartScript}`,
      );
    }
    return `${lines.join(os.EOL)}${os.EOL}`;
  }

  return `${[
    "",
    "Aionis is ready.",
    ...runtimeLines,
    "SDK package: @aionis/sdk",
    "MCP package: @aionis/mcp",
    "Claude Code hooks package: @aionis/claude-code",
    ...(input.withZvecAnn ? zvecCompletionLines(input.targetDir, input.zvecPath) : []),
    ...aifsLines,
  ].join(os.EOL)}${os.EOL}`;
}

function zvecCompletionLines(targetDir: string, zvecPath: string | null | undefined): string[] {
  return [
    "Zvec ANN sidecar: enabled for candidate generation; SQLite remains the Runtime fact source.",
    zvecPath?.trim()
      ? `Zvec index path: ${zvecPath.trim()}`
      : "Zvec index path: Runtime default",
    `Zvec doctor: cd ${targetDir} && npm run -s recall:ann:scale`,
  ];
}

function ensureZvecAvailable(targetDir: string): void {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('@zvec/zvec');"],
    {
      cwd: targetDir,
      stdio: "pipe",
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error([
      "Zvec ANN was requested, but @zvec/zvec is not importable from the installed Runtime.",
      "Install support may be unavailable on this platform, or optional dependency installation failed.",
      "Rerun without --with-zvec-ann, or install @zvec/zvec in the Runtime directory and retry.",
      detail ? `Cause: ${detail}` : "",
    ].filter(Boolean).join(os.EOL));
  }
}

export function isCliEntrypoint(argvEntry: string | undefined, moduleUrl = import.meta.url): boolean {
  if (!argvEntry) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    return fs.realpathSync(argvEntry) === fs.realpathSync(modulePath);
  } catch {
    return path.resolve(argvEntry) === path.resolve(modulePath);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCreateAionisArgs(argv);
  ensureNodeVersion();
  ensureCommand("git");
  ensureCommand("npm");

  const targetDir = path.resolve(options.dir);
  if (nonEmptyDirectory(targetDir)) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }

  process.stdout.write(`Aionis installer\n`);
  for (const step of createInstallPlan({ ...options, dir: targetDir })) {
    process.stdout.write(`- ${step}\n`);
  }

  const cloneArgs = ["clone", "--depth", "1"];
  if (options.branch) cloneArgs.push("--branch", options.branch);
  cloneArgs.push(options.repo, targetDir);
  run("git", cloneArgs, null);

  const { providerKey, apiKey } = writeRuntimeEnv(targetDir, options);

  if (!options.skipInstall) {
    run("npm", ["install"], targetDir);
    run("npm", ["run", "-s", "build"], targetDir);
    if (options.withZvecAnn) ensureZvecAvailable(targetDir);
  }

  const quickstart = quickstartScriptName(options.quickstart);
  if (!options.skipQuickstart && quickstart) {
    const quickstartNeedsKey = quickstartRequiresEmbeddingKey(options.quickstart);
    if (!apiKey && quickstartNeedsKey) {
      process.stdout.write(createCompletionMessage({
        targetDir,
        providerKey,
        apiKey,
        embeddingProvider: options.provider,
        quickstartScript: quickstart,
        withAifs: options.withAifs,
        runtimeBaseUrl: options.withClaudeCode ? options.claudeCodeBaseUrl : undefined,
        quickstartRequiresEmbeddingKey: quickstartNeedsKey,
        withZvecAnn: options.withZvecAnn,
        zvecPath: options.zvecPath,
      }));
      return;
    }
    const quickstartEnv = quickstartRunEnv(options, targetDir, providerKey, apiKey);
    run("npm", ["run", "-s", quickstart], targetDir, quickstartEnv);
  }

  if (options.withClaudeCode) {
    const hookInstall = createClaudeCodeInstallCommand(options);
    run(hookInstall.command, hookInstall.args, hookInstall.cwd);
  }

  process.stdout.write(createCompletionMessage({
    targetDir,
    providerKey,
    apiKey,
    embeddingProvider: options.provider,
    quickstartScript: options.skipQuickstart ? null : quickstart,
    withAifs: options.withAifs,
    runtimeBaseUrl: options.withClaudeCode ? options.claudeCodeBaseUrl : undefined,
    quickstartRequiresEmbeddingKey: quickstartRequiresEmbeddingKey(options.quickstart),
    withZvecAnn: options.withZvecAnn,
    zvecPath: options.zvecPath,
  }));
}

if (isCliEntrypoint(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
