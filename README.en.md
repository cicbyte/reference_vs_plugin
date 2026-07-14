# Reference - VS Code Extension

**English | [中文](README.md)**

> Visually manage code repository references and knowledge files in VS Code, providing a zero-latency, reusable code knowledge base for AI coding assistants.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code: ^1.85.0](https://img.shields.io/badge/VS%20Code-^1.85.0-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)

<!-- screenshot: Add sidebar TreeView screenshot here -->

## Features

- **Multi-AI Assistant Integration** — Multi-select agent injection at init (Claude Code, Codex, OpenCode, ZCode, MiMo Code); auto-generates sub-agents and Skill files
- **Repository Reference Management** — Add (remote/local), update, and remove Git repository references through a GUI — no terminal needed
- **Source Code Browser** — Browse referenced repository directory structures in the sidebar tree view; click any file to open it
- **Knowledge File Management** — View `.md` knowledge files under `.reference/wiki/`, grouped by repository; commit/sync targets remote wiki, local knowledge base (localwiki), or both
- **Code Statistics** — Webview displaying language distribution, lines of code, complexity, and top file rankings
- **Health Diagnostics** — Per-project doctor (structured checklist Webview) and cross-project global health check (concurrent scan to spot broken references)
- **Global Management** — Overview of all projects (reference counts, missing projects, agent configs); clean up stale records and orphan cache; remove references across projects
- **Status Bar Integration** — Real-time repo count and sync status in the status bar
- **Auto Refresh** — Watches `.reference/` for changes and automatically updates tree views
- **Workspace Init Guide** — Guides initialization when `.reference/` is absent; initialized workspaces can reuse or reselect agents

## Prerequisites

This extension is a graphical frontend for the [reference](https://github.com/cicbyte/reference) CLI tool and **contains no business logic**. Install the `reference` binary (**v0.0.8+**; multi-AI-agent, localwiki and other features depend on this version) before use:

```bash
# Go install
go install github.com/cicbyte/reference@latest

# Or manually download the binary and add to PATH
```

Verify installation:

```bash
reference version
```

## Installation

### From VSIX

```bash
# After downloading the .vsix file
code --install-extension reference-vscode-plugin-0.1.0.vsix
```

### Build from Source

```bash
git clone https://github.com/cicbyte/reference-vscode-plugin.git
cd reference-vscode-plugin
npm install
npm run build
# Press F5 to launch extension debug host
```

## Usage

### Initialize

When using for the first time in a project, click the Reference icon in the activity bar, then click **Initialize Now**. In the multi-select list, pick the AI assistants to inject (Claude Code, Codex, OpenCode, ZCode, MiMo Code); select none for repository management only. An already-initialized workspace prompts to reuse the current agents or pick a new set.

### Add Repository

Via the sidebar **+** button or Command Palette `Reference: Add Repository`:

- **Remote** — Enter a Git URL (e.g. `github.com/gin-gonic/gin`), optionally specify a branch; the latest cache is pulled
- **Local** — Select a local Git repository path and enter a reference name

### Manage References

| Action | Entry Point |
|--------|-------------|
| Update a repo | Right-click repo node → sync icon |
| Remove a repo | Right-click repo node → trash icon |
| Remove all | Quick Actions → Remove All Repositories |
| View code stats | Right-click repo → Show Code Statistics |
| Open repo folder | Right-click repo → Open Repository Folder |

### Browse Knowledge Files

Switch to the **Knowledge Files** panel to view `.md` knowledge files grouped by repository. Click to open in the editor.

### Command Palette

All commands are prefixed with `Reference:` and accessible via `Ctrl+Shift+P`:

| Command | Description |
|---------|-------------|
| `Reference: Add Repository` | Add a remote or local repository (remote pulls latest cache) |
| `Reference: Remove Repository` | Remove a single repository |
| `Reference: Remove All Repositories` | Remove all repositories (optionally clean .reference/) |
| `Reference: Update Repository` | Update a single repository's cache |
| `Reference: Initialize Workspace` | Initialize the workspace; multi-select agent injection |
| `Reference: Show Code Statistics` | Code statistics Webview |
| `Reference: Run Doctor` | Per-project diagnostics (structured checklist Webview) |
| `Reference: Global Health Check` | Cross-project concurrent health scan |
| `Reference: Show All Projects` | Global projects overview Webview |
| `Reference: Remove Global Reference` | Remove a reference across projects |
| `Reference: Clean Up Unused References & Cache` | Clean stale records and orphan cache (dry-run preview + confirm) |
| `Reference: Wiki Commit` | Commit knowledge base changes (remote / local / both) |
| `Reference: Wiki Sync` | Sync knowledge base (pull + commit + push) |
| `Reference: Check CLI Installation` | Check CLI installation status |
| `Reference: Show Diagnostics & Logs` | Open output channel for logs |

## Configuration

Search for `reference` in VS Code Settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `reference.binaryPath` | string | `""` | Absolute path to the reference binary. Leave empty to auto-detect from PATH. |
| `reference.autoRefresh` | boolean | `true` | Automatically refresh tree views when .reference/ directory changes. |

## Architecture

```
src/
├── extension.ts           # Extension entry point
├── types.ts               # Type definitions
├── services/
│   ├── binaryManager.ts   # Binary detection, version validation
│   ├── cli.ts             # CLI command wrapper (execFile + JSON/text parsing)
│   └── workspaceManager.ts # .reference/ directory management + file watching
└── ui/
    ├── treeView.ts         # TreeDataProvider (repos/knowledge/actions)
    ├── statusBar.ts        # Status bar
    └── commands.ts         # Command registration & implementation
```

Core design: the extension calls the `reference` binary via `child_process.execFile`, parsing `--format jsonl` output. No business logic is embedded.

## Build & Development

```bash
npm install          # Install dependencies
npm run watch        # Incremental build + watch
npm run build        # Production build (minified)
npm run lint         # TypeScript type checking
npm run package      # Package .vsix
```

Debug: open the project in VS Code and press **F5** to launch the Extension Development Host.

## License

[MIT](LICENSE)
