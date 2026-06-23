# @aionis/create

One-command installer for Aionis Runtime, SDK, MCP bridge, AIFS, and optional
Claude Code lifecycle hooks.

Docs: [https://docs.aionis.work/developer-platform/start/install](https://docs.aionis.work/developer-platform/start/install)

Source repositories:

- Runtime: [ostinatocc/Aionis](https://github.com/ostinatocc/Aionis)
- Installer package: [ostinatocc/aionis-create](https://github.com/ostinatocc/aionis-create)
- SDK package: [ostinatocc/aionis-sdk](https://github.com/ostinatocc/aionis-sdk)
- MCP package: [ostinatocc/aionis-mcp](https://github.com/ostinatocc/aionis-mcp)
- AIFS package: [ostinatocc/aionis-aifs](https://github.com/ostinatocc/aionis-aifs)
- Claude Code plugin: [ostinatocc/aionis-claude-code](https://github.com/ostinatocc/aionis-claude-code)

Run:

```bash
npx @aionis/create@latest
```

The default run installs Aionis and starts the no-key first-value demo. It shows
the Memory Firewall blocking failed and stale memory before you configure an
embedding provider.

Run the full SDK quickstart with OpenAI-compatible embeddings:

```bash
OPENAI_API_KEY="your-key" npx @aionis/create@latest --provider openai --quickstart sdk
```

Install without running any quickstart:

```bash
npx @aionis/create@latest my-aionis --skip-quickstart
```

Install Runtime into a side directory and onboard Claude Code globally:

```bash
npx @aionis/create@latest .aionis-runtime --with-claude-code
```

This writes `PORT=3101` into `.aionis-runtime/.env`, matching the Claude Code
plugin default `http://127.0.0.1:3101`. Start Runtime with:

```bash
cd .aionis-runtime
npm run -s lite:start
```

Install Runtime and include the AIFS file-surface package:

```bash
npx @aionis/create@latest my-aionis --with-aifs
```

Then run AIFS from the agent project that should contain `.aionis/`:

```bash
npx @aionis/aifs@latest init --base-url http://127.0.0.1:3001 --scope my-project
npx @aionis/aifs@latest doctor --base-url http://127.0.0.1:3001 --scope my-project
npx @aionis/aifs@latest refresh --base-url http://127.0.0.1:3001 --scope my-project
```

The installer clones the Runtime repo, installs dependencies, writes `.env`,
runs the Runtime build check, then optionally runs a quickstart and Claude Code
onboarding. Use `@aionis/sdk` for application integration, `@aionis/mcp` for
MCP clients, `@aionis/aifs` for `.aionis/` workspace files, and
`@aionis/claude-code` for Claude Code lifecycle integration.

If no embedding key is detected, the installer writes `EMBEDDING_PROVIDER=none`
so the local Runtime can start immediately. That no-key mode is enough for the
first-value demo, MCP wiring, execution-memory smoke tests, and Memory Firewall
candidate governance. Configure semantic recall later by setting
`EMBEDDING_PROVIDER=openai` plus `OPENAI_API_KEY`, or
`EMBEDDING_PROVIDER=minimax` plus `MINIMAX_API_KEY`, in the generated `.env`.

Common first runs:

```bash
OPENAI_API_KEY="your-key" npx @aionis/create@latest --provider openai --quickstart multi-agent
```

After install, pick the integration path:

- SDK: [https://docs.aionis.work/plugins/sdk](https://docs.aionis.work/plugins/sdk)
- AIFS: [https://docs.aionis.work/plugins/aifs](https://docs.aionis.work/plugins/aifs)
- Claude Code hooks: [https://docs.aionis.work/plugins/claude-code](https://docs.aionis.work/plugins/claude-code)
- MCP for Claude Code / Cursor: [https://docs.aionis.work/plugins/mcp](https://docs.aionis.work/plugins/mcp)
- Memory Firewall: [https://docs.aionis.work/developer-platform/products/memory-firewall](https://docs.aionis.work/developer-platform/products/memory-firewall)
