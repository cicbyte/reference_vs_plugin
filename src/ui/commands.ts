import * as vscode from 'vscode';
import * as path from 'path';
import { ReferenceCLI } from '../services/cli';
import { BinaryManager } from '../services/binaryManager';
import { WorkspaceManager } from '../services/workspaceManager';
import { RepoTreeProvider, WikiTreeProvider } from './treeView';
import { StatusBar } from './statusBar';

export class CommandRegistrar {
    constructor(
        private cli: ReferenceCLI,
        private binary: BinaryManager,
        private ws: WorkspaceManager,
        private repoTree: RepoTreeProvider,
        private wikiTree: WikiTreeProvider,
        private statusBar: StatusBar,
        private outputChannel: vscode.OutputChannel,
    ) {}

    registerAll(context: vscode.ExtensionContext): void {
        const registrations: vscode.Disposable[] = [
            // Binary
            vscode.commands.registerCommand('reference.checkBinary', () => this.checkBinary()),
            // Repo management
            vscode.commands.registerCommand('reference.addRepo', () => this.addRepo()),
            vscode.commands.registerCommand('reference.removeRepo', (node?: any) => this.removeRepo(node)),
            vscode.commands.registerCommand('reference.updateRepo', (node?: any) => this.updateRepo(node)),
            vscode.commands.registerCommand('reference.updateAllRepos', () => this.updateAllRepos()),
            vscode.commands.registerCommand('reference.listRepos', () => this.listRepos()),
            // Knowledge
            vscode.commands.registerCommand('reference.analyze', (node?: any) => this.analyze(node)),
            vscode.commands.registerCommand('reference.explore', (node?: any) => this.explore(node)),
            // Stats & Diagnostics
            vscode.commands.registerCommand('reference.viewStats', (node?: any) => this.viewStats(node)),
            vscode.commands.registerCommand('reference.browseCache', () => this.browseCache()),
            vscode.commands.registerCommand('reference.diagnostics', () => this.showDiagnostics()),
            // Navigation
            vscode.commands.registerCommand('reference.openWikiFile', (node?: any) => this.openWikiFile(node)),
            vscode.commands.registerCommand('reference.openRepoFolder', (node?: any) => this.openRepoFolder(node)),
            // Refresh
            vscode.commands.registerCommand('reference.refreshRepos', () => { this.repoTree.refresh(); }),
            vscode.commands.registerCommand('reference.refreshWiki', () => { this.wikiTree.refresh(); }),
        ];

        context.subscriptions.push(...registrations);
    }

    private requireBinary(): boolean {
        if (!this.binary.getBinaryPath()) {
            vscode.window.showWarningMessage(
                'Reference CLI not found. Please install it first.',
                'Check Installation',
            ).then(choice => {
                if (choice === 'Check Installation') {
                    vscode.commands.executeCommand('reference.checkBinary');
                }
            });
            return false;
        }
        return true;
    }

    private getRepoName(node: any): string | undefined {
        if (node?.name) { return node.name; }
        if (node?.label && typeof node.label === 'string') { return node.label; }
        return undefined;
    }

    private async pickRepo(prompt: string): Promise<string | undefined> {
        const mapEntries = this.ws.readMapFile();
        if (mapEntries.length === 0) {
            vscode.window.showInformationMessage('No repositories referenced yet.');
            return undefined;
        }
        const items = mapEntries.map(e => ({
            label: e.ref_name,
            description: e.type === 'remote' ? e.full_name : '(local)',
        }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: prompt });
        return selected?.label;
    }

    // ─── Binary ──────────────────────────────────────────────

    private async checkBinary(): Promise<void> {
        const result = await this.binary.detect();
        if (result) {
            const version = await this.binary.getVersion();
            vscode.window.showInformationMessage(
                `Reference CLI found: ${result}${version ? ` (${version})` : ''}`,
            );
        } else {
            const action = await vscode.window.showErrorMessage(
                'Reference CLI not found. Please install it or configure the binary path.',
                'Open Settings',
                'See Installation Guide',
            );
            if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'reference.binaryPath');
            } else if (action === 'See Installation Guide') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/cicbyte/reference#installation'));
            }
        }
        this.statusBar.update();
    }

    // ─── Repo Management ─────────────────────────────────────

    private async addRepo(): Promise<void> {
        if (!this.requireBinary()) { return; }

        const mode = await vscode.window.showQuickPick(
            [
                { label: '$(globe) Remote Repository', description: 'Clone from URL', value: 'remote' as const },
                { label: '$(folder) Local Repository', description: 'Link a local Git repo', value: 'local' as const },
            ],
            { placeHolder: 'Select repository source type' },
        );
        if (!mode) { return; }

        if (mode.value === 'local') {
            return this.addLocalRepo();
        }
        return this.addRemoteRepo();
    }

    private async addRemoteRepo(): Promise<void> {
        const url = await vscode.window.showInputBox({
            prompt: 'Enter repository URL or owner/repo',
            placeHolder: 'https://github.com/owner/repo or owner/repo',
            ignoreFocusOut: true,
        });
        if (!url) { return; }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter reference name (optional)',
            placeHolder: 'Auto-detect from URL',
        });

        const branch = await vscode.window.showInputBox({
            prompt: 'Enter branch or tag (optional)',
            placeHolder: 'Default branch',
        });

        await vscode.window.withProgress(
            { title: `Adding remote repository: ${url}`, location: vscode.ProgressLocation.Notification, cancellable: true },
            async () => {
                const result = await this.cli.addRepo(url, name || undefined, {
                    depth: 1,
                    branch: branch || undefined,
                });
                if (result.success) {
                    vscode.window.showInformationMessage('Repository added successfully.');
                    this.repoTree.refresh();
                    this.wikiTree.refresh();
                    this.statusBar.update();
                } else {
                    vscode.window.showErrorMessage(`Failed to add repository: ${result.error}`);
                }
            },
        );
    }

    private async addLocalRepo(): Promise<void> {
        const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select a local Git repository',
            openLabel: 'Select Repository',
        });
        if (!folders || folders.length === 0) { return; }

        const localPath = folders[0].fsPath;
        const name = await vscode.window.showInputBox({
            prompt: 'Enter reference name',
            placeHolder: localPath.split(/[\\/]/).pop() || 'my-repo',
            ignoreFocusOut: true,
        });
        if (!name) { return; }

        await vscode.window.withProgress(
            { title: `Adding local repository: ${name}`, location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.addRepo(localPath, name, { local: true });
                if (result.success) {
                    vscode.window.showInformationMessage(`Local repository "${name}" added.`);
                    this.repoTree.refresh();
                    this.wikiTree.refresh();
                    this.statusBar.update();
                } else {
                    vscode.window.showErrorMessage(`Failed to add repository: ${result.error}`);
                }
            },
        );
    }

    private async removeRepo(node?: any): Promise<void> {
        if (!this.requireBinary()) { return; }

        const repoName = this.getRepoName(node) || await this.pickRepo('Select repository to remove');
        if (!repoName) { return; }

        const purge = await vscode.window.showQuickPick(
            [
                { label: 'Remove reference only', description: 'Keep global cache', purge: false },
                { label: 'Remove and purge cache', description: 'Also delete global cache', purge: true },
            ],
            { placeHolder: `Remove "${repoName}"` },
        );
        if (!purge) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${repoName}"?`,
            { modal: true },
            'Remove',
        );
        if (confirm !== 'Remove') { return; }

        const result = await this.cli.removeRepo(repoName, purge.purge);
        if (result.success) {
            vscode.window.showInformationMessage(`Repository "${repoName}" removed.`);
            this.repoTree.refresh();
            this.wikiTree.refresh();
            this.statusBar.update();
        } else {
            vscode.window.showErrorMessage(`Failed to remove: ${result.error}`);
        }
    }

    private async updateRepo(node?: any): Promise<void> {
        if (!this.requireBinary()) { return; }

        const repoName = this.getRepoName(node) || await this.pickRepo('Select repository to update');
        if (!repoName) { return; }

        await vscode.window.withProgress(
            { title: `Updating ${repoName}...`, location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.updateRepo(repoName);
                if (result.success) {
                    vscode.window.showInformationMessage(`Repository "${repoName}" updated.`);
                    this.repoTree.refresh();
                    this.wikiTree.refresh();
                } else {
                    vscode.window.showErrorMessage(`Failed to update: ${result.error}`);
                }
            },
        );
    }

    private async updateAllRepos(): Promise<void> {
        if (!this.requireBinary()) { return; }

        await vscode.window.withProgress(
            { title: 'Updating all repositories...', location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.updateRepo();
                if (result.success) {
                    vscode.window.showInformationMessage('All repositories updated.');
                    this.repoTree.refresh();
                    this.wikiTree.refresh();
                } else {
                    vscode.window.showErrorMessage(`Update failed: ${result.error}`);
                }
            },
        );
    }

    private async listRepos(): Promise<void> {
        if (!this.requireBinary()) { return; }
        const result = await this.cli.listRepos(this.ws.getWorkspaceRoot());
        if (result.success && result.data) {
            const items = result.data.map(r => ({
                label: r.name,
                description: `${r.type} · ${r.branch || 'unknown'} · ${r.commit_at}`,
                detail: r.source,
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Referenced repositories',
            });
            if (picked) {
                const mapEntry = this.ws.readMapFile().find(e => e.ref_name === picked.label);
                if (mapEntry) {
                    const wikiPath = path.resolve(this.ws.getWorkspaceRoot()!, mapEntry.wiki_path);
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(wikiPath));
                }
            }
        }
    }

    // ─── Knowledge ───────────────────────────────────────────

    private async analyze(node?: any): Promise<void> {
        if (!this.requireBinary()) { return; }
        const repoName = this.getRepoName(node) || await this.pickRepo('Select repository to analyze');
        if (!repoName) { return; }

        // Analyze uses the reference-analyzer agent, which is a Claude Code agent.
        // For the plugin, we guide the user to use the CLI or Claude Code.
        vscode.window.showInformationMessage(
            `Architecture analysis for "${repoName}" requires Claude Code's reference-analyzer agent. Run in terminal: reference analyze ${repoName}`,
        );
    }

    private async explore(node?: any): Promise<void> {
        if (!this.requireBinary()) { return; }
        const repoName = this.getRepoName(node) || await this.pickRepo('Select repository to explore');
        if (!repoName) { return; }

        const question = await vscode.window.showInputBox({
            prompt: `Ask a question about "${repoName}"`,
            placeHolder: 'e.g., How does authentication work?',
            ignoreFocusOut: true,
        });
        if (!question) { return; }

        vscode.window.showInformationMessage(
            `Topic exploration for "${repoName}" requires Claude Code's reference-explorer agent. Use the reference skill in Claude Code with your question.`,
        );
    }

    // ─── Stats & Diagnostics ─────────────────────────────────

    private async viewStats(node?: any): Promise<void> {
        if (!this.requireBinary()) { return; }
        const repoName = this.getRepoName(node) || await this.pickRepo('Select repository for stats');
        if (!repoName) { return; }

        const result = await this.cli.getStats(repoName);
        if (!result.success || !result.data) {
            vscode.window.showErrorMessage(`Failed to get stats: ${result.error}`);
            return;
        }

        // Show stats in a webview panel
        const panel = vscode.window.createWebviewPanel(
            'reference.stats',
            `Code Statistics: ${repoName}`,
            vscode.ViewColumn.One,
            { enableScripts: false },
        );

        panel.webview.html = this.renderStatsHtml(repoName, result.data);
    }

    private async browseCache(): Promise<void> {
        const home = process.env.USERPROFILE || process.env.HOME || '';
        const cachePath = path.join(home, '.cicbyte', 'reference');
        if (require('fs').existsSync(cachePath)) {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(cachePath));
        } else {
            vscode.window.showWarningMessage(`Cache directory not found: ${cachePath}`);
        }
    }

    private showDiagnostics(): void {
        this.outputChannel.show(true);
        const info = [
            `Binary: ${this.binary.getBinaryPath() || 'not found'}`,
            `Workspace: ${this.ws.getWorkspaceRoot() || 'none'}`,
            `.reference dir: ${this.ws.getReferenceDir() || 'none'}`,
            `Repos: ${this.ws.readMapFile().map(e => e.ref_name).join(', ') || 'none'}`,
        ];
        this.outputChannel.appendLine('\n─── Diagnostics ───');
        info.forEach(line => this.outputChannel.appendLine(line));
        this.outputChannel.appendLine('────────────────────\n');
    }

    // ─── Navigation ──────────────────────────────────────────

    private async openWikiFile(node?: any): Promise<void> {
        if (!node) { return; }
        const filePath = node.filePath || node.resourceUri?.fsPath;
        if (filePath) {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
        }
    }

    private async openRepoFolder(node?: any): Promise<void> {
        const repoName = this.getRepoName(node) || await this.pickRepo('Select repository to open');
        if (!repoName) { return; }

        const reposDir = this.ws.getReposDir();
        if (reposDir) {
            const repoPath = path.join(reposDir, repoName);
            if (require('fs').existsSync(repoPath)) {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(repoPath));
            } else {
                vscode.window.showWarningMessage(`Repository path not found: ${repoPath}`);
            }
        }
    }

    // ─── Stats HTML Renderer ─────────────────────────────────

    private renderStatsHtml(repoName: string, entries: any[]): string {
        const languages = entries.filter((e: any) => e.type === 'language');
        const topFiles = entries.filter((e: any) => e.type === 'topFiles');

        const totalCode = languages.reduce((sum: number, l: any) => sum + l.code, 0);
        const totalFiles = languages.reduce((sum: number, l: any) => sum + l.files, 0);

        const langRows = languages.map((l: any) => `
            <tr>
                <td>${l.languages}</td>
                <td>${l.files}</td>
                <td>${l.code.toLocaleString()}</td>
                <td>${l.complexity}</td>
                <td><div class="bar" style="width:${totalCode ? (l.code / totalCode * 100) : 0}%"></div></td>
            </tr>
        `).join('');

        const fileRows = topFiles.map((f: any) => `
            <tr>
                <td>${f.filename}</td>
                <td>${f.language}</td>
                <td>${f.location}</td>
                <td>${f.code.toLocaleString()}</td>
                <td>${f.complexity}</td>
            </tr>
        `).join('');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Code Statistics: ${repoName}</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
        h1 { font-size: 1.5em; margin-bottom: 0.5em; }
        h2 { font-size: 1.2em; margin-top: 1.5em; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 6px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
        th { font-weight: 600; }
        .summary { display: flex; gap: 30px; margin: 15px 0; }
        .summary-card { background: var(--vscode-editor-background); padding: 15px 25px; border-radius: 6px; }
        .summary-card .value { font-size: 1.8em; font-weight: bold; }
        .summary-card .label { color: var(--vscode-descriptionForeground); }
        .bar { height: 8px; background: var(--vscode-button-background); border-radius: 4px; min-width: 2px; }
    </style>
</head>
<body>
    <h1>Code Statistics: ${repoName}</h1>
    <div class="summary">
        <div class="summary-card">
            <div class="value">${totalCode.toLocaleString()}</div>
            <div class="label">Lines of Code</div>
        </div>
        <div class="summary-card">
            <div class="value">${totalFiles}</div>
            <div class="label">Files</div>
        </div>
        <div class="summary-card">
            <div class="value">${languages.length}</div>
            <div class="label">Languages</div>
        </div>
    </div>
    <h2>Languages</h2>
    <table>
        <tr><th>Language</th><th>Files</th><th>Code</th><th>Complexity</th><th>Share</th></tr>
        ${langRows}
    </table>
    <h2>Top Files</h2>
    <table>
        <tr><th>File</th><th>Language</th><th>Path</th><th>Code</th><th>Complexity</th></tr>
        ${fileRows}
    </table>
</body>
</html>`;
    }
}
