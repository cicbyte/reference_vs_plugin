import * as vscode from 'vscode';
import * as path from 'path';
import { ReferenceCLI } from '../services/cli';
import { BinaryManager } from '../services/binaryManager';
import { WorkspaceManager } from '../services/workspaceManager';
import { RepoTreeProvider, WikiTreeProvider, ActionsTreeProvider } from './treeView';
import { StatusBar } from './statusBar';
import { DoctorResult, GlobalDoctorResult, GlobalDoctorCheck, GlobalListResult, GlobalProjectItem } from '../types';

export class CommandRegistrar {
    constructor(
        private cli: ReferenceCLI,
        private binary: BinaryManager,
        private ws: WorkspaceManager,
        private repoTree: RepoTreeProvider,
        private wikiTree: WikiTreeProvider,
        private actionsTree: ActionsTreeProvider,
        private statusBar: StatusBar,
        private outputChannel: vscode.OutputChannel,
    ) {}

    /** Refresh all tree views, status bar, and context variables. */
    private refreshAll(): void {
        this.repoTree.refresh();
        this.wikiTree.refresh();
        this.actionsTree.refresh();
        this.statusBar.update();
    }

    registerAll(context: vscode.ExtensionContext): void {
        const registrations: vscode.Disposable[] = [
            // Binary & Init
            vscode.commands.registerCommand('reference.checkBinary', () => this.checkBinary()),
            vscode.commands.registerCommand('reference.init', () => this.initWorkspace()),
            // Repo management
            vscode.commands.registerCommand('reference.addRepo', () => this.addRepo()),
            vscode.commands.registerCommand('reference.removeRepo', (node?: any) => this.removeRepo(node)),
            vscode.commands.registerCommand('reference.removeAllRepos', () => this.removeAllRepos()),
            vscode.commands.registerCommand('reference.updateRepo', (node?: any) => this.updateRepo(node)),
            vscode.commands.registerCommand('reference.listRepos', () => this.listRepos()),
            // Knowledge
            vscode.commands.registerCommand('reference.analyze', (node?: any) => this.analyze(node)),
            vscode.commands.registerCommand('reference.explore', (node?: any) => this.explore(node)),
            // Stats & Diagnostics
            vscode.commands.registerCommand('reference.viewStats', (node?: any) => this.viewStats(node)),
            vscode.commands.registerCommand('reference.diagnostics', () => this.showDiagnostics()),
            vscode.commands.registerCommand('reference.doctor', () => this.runDoctor()),
            vscode.commands.registerCommand('reference.globalDoctor', () => this.runGlobalDoctor()),
            vscode.commands.registerCommand('reference.globalGc', () => this.runGlobalGc()),
            vscode.commands.registerCommand('reference.globalList', () => this.runGlobalList()),
            vscode.commands.registerCommand('reference.globalRemove', () => this.runGlobalRemove()),
            vscode.commands.registerCommand('reference.wikiCommit', () => this.wikiCommit()),
            vscode.commands.registerCommand('reference.wikiSync', () => this.wikiSync()),
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
        const mapEntries = this.ws.getAllRepos();
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

    private async initWorkspace(): Promise<void> {
        if (!this.requireBinary()) { return; }

        if (this.ws.isInitialized()) {
            vscode.window.showInformationMessage('This workspace is already initialized.');
            return;
        }

        const agentPicks = await vscode.window.showQuickPick(
            [
                { label: 'Claude Code', description: 'Inject agent configs into .claude/', id: 'claude' },
                { label: 'Codex', description: 'Inject agent configs into .codex/', id: 'codex' },
                { label: 'OpenCode', description: 'Inject agent configs into .opencode/', id: 'opencode' },
                { label: 'ZCode', description: 'Inject agent configs into .zcode/', id: 'zcode' },
                { label: 'MiMo Code', description: 'Inject agent configs into .mimocode/', id: 'mimocode' },
            ],
            {
                canPickMany: true,
                placeHolder: 'Select AI assistants to inject (multi-select, or skip for repo management only)',
                title: 'Reference — Choose Agents',
            },
        );
        if (agentPicks === undefined) { return; } // user pressed Esc

        // CLI init --agent accepts comma-separated IDs; empty/none means no AI config injection.
        const agent = agentPicks.length > 0 ? agentPicks.map(p => p.id).join(',') : 'none';

        await vscode.window.withProgress(
            { title: `Initializing Reference (agents: ${agent})...`, location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.init(agent);
                if (result.success) {
                    vscode.window.showInformationMessage('Reference initialized successfully.');
                    this.refreshAll();
                } else {
                    vscode.window.showErrorMessage(`Initialization failed: ${result.error}`);
                }
            },
        );
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
                    update: true,
                    branch: branch || undefined,
                });
                if (result.success) {
                    this.outputChannel.appendLine(`[addRepo] CLI output: ${result.rawOutput || result.data}`);
                    this.refreshAll();
                    // Verify the repo actually appears in the map
                    const repos = this.ws.getAllRepos();
                    const found = repos.some(r => url.includes(r.ref_name) || r.full_name?.includes(url));
                    if (repos.length === 0 && !found) {
                        vscode.window.showWarningMessage(
                            `CLI reported success but repo not found in map file. Check Output → Reference for details.`,
                        );
                    } else {
                        vscode.window.showInformationMessage(
                            `Repository added. ${result.rawOutput?.trim() || ''}`,
                        );
                    }
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
                    this.outputChannel.appendLine(`[addRepo] CLI output: ${result.rawOutput || result.data}`);
                    this.refreshAll();
                    const repos = this.ws.getAllRepos();
                    const found = repos.some(r => r.ref_name === name);
                    if (!found) {
                        vscode.window.showWarningMessage(
                            `CLI reported success but "${name}" not found in map file. Check Output → Reference for details.`,
                        );
                    } else {
                        vscode.window.showInformationMessage(`Local repository "${name}" added.`);
                    }
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

        const mode = await vscode.window.showQuickPick(
            [
                { label: 'Remove reference only', description: 'Keep global cache', mode: 'ref' as const },
                { label: 'Remove and purge cache', description: 'Also delete global cache', mode: 'purge' as const },
            ],
            { placeHolder: `Remove "${repoName}"` },
        );
        if (!mode) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${repoName}"?`,
            { modal: true },
            'Remove',
        );
        if (confirm !== 'Remove') { return; }

        const result = await this.cli.removeRepo(repoName, mode.mode === 'purge');
        if (result.success) {
            vscode.window.showInformationMessage(`Repository "${repoName}" removed.`);
            this.refreshAll();
        } else {
            vscode.window.showErrorMessage(`Failed to remove: ${result.error}`);
        }
    }

    private async removeAllRepos(): Promise<void> {
        if (!this.requireBinary()) { return; }

        const hasRepos = this.ws.getAllRepos().length > 0;

        const mode = await vscode.window.showQuickPick(
            [
                { label: 'Remove all references', description: 'Keep .reference directory', mode: 'all' as const },
                { label: 'Remove all and clean', description: 'Also remove .reference dir and AI config', mode: 'clean' as const },
            ],
            { placeHolder: hasRepos ? 'Remove all repositories from this project' : 'Remove Reference configuration from this project' },
        );
        if (!mode) { return; }

        const confirm = await vscode.window.showWarningMessage(
            mode.mode === 'clean'
                ? 'Remove all Reference data and clean .reference directory?'
                : hasRepos
                    ? 'Remove ALL repositories from this project?'
                    : 'Remove Reference configuration?',
            { modal: true },
            'Remove',
        );
        if (confirm !== 'Remove') { return; }

        const result = await this.cli.removeAllRepos(mode.mode === 'clean');
        if (result.success) {
            vscode.window.showInformationMessage('Reference data removed.');
            this.refreshAll();
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
                    this.refreshAll();
                } else {
                    vscode.window.showErrorMessage(`Failed to update: ${result.error}`);
                }
            },
        );
    }

    private async listRepos(): Promise<void> {
        if (!this.requireBinary()) { return; }
        const result = await this.cli.listRepos();
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
                const mapEntry = this.ws.getAllRepos().find(e => e.ref_name === picked.label);
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

    private showDiagnostics(): void {
        this.outputChannel.show(true);
        const info = [
            `Binary: ${this.binary.getBinaryPath() || 'not found'}`,
            `Workspace: ${this.ws.getWorkspaceRoot() || 'none'}`,
            `.reference dir: ${this.ws.getReferenceDir() || 'none'}`,
            `Repos: ${this.ws.getAllRepos().map(e => e.ref_name).join(', ') || 'none'}`,
        ];
        this.outputChannel.appendLine('\n─── Diagnostics ───');
        info.forEach(line => this.outputChannel.appendLine(line));
        this.outputChannel.appendLine('────────────────────\n');
    }

    private async runDoctor(): Promise<void> {
        if (!this.requireBinary()) { return; }

        await vscode.window.withProgress(
            { title: 'Running reference doctor...', location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.runDoctorStructured();
                if (result.success && result.data) {
                    this.outputChannel.appendLine(`[doctor] ${result.data.summary}`);
                    const panel = vscode.window.createWebviewPanel(
                        'reference.doctor',
                        'Reference — Doctor',
                        vscode.ViewColumn.Active,
                        { enableScripts: false },
                    );
                    panel.webview.html = this.renderDoctorHtml(result.data);
                    vscode.window.showInformationMessage('Doctor check complete.');
                } else {
                    vscode.window.showErrorMessage(`Doctor failed: ${result.error}`);
                }
            },
        );
    }

    private doctorStatusMeta(status: string): { icon: string; label: string; color: string } {
        switch (status) {
            case 'ok':    return { icon: '✓', label: 'OK',    color: 'var(--vscode-testing-iconPassed)' };
            case 'fixed': return { icon: '✎', label: 'Fixed', color: 'var(--vscode-testing-iconQueued)' };
            case 'warn':  return { icon: '!', label: 'Warn',  color: 'var(--vscode-testing-iconFailed)' };
            default:      return { icon: '?', label: status,  color: 'var(--vscode-descriptionForeground)' };
        }
    }

    private renderDoctorHtml(result: DoctorResult): string {
        const groups = ['core', 'agent'].filter(g => result.checks.some(c => c.group === g));
        const renderGroup = (group: string) => {
            const rows = result.checks
                .filter(c => c.group === group)
                .map(c => {
                    const m = this.doctorStatusMeta(c.status);
                    return `<tr>
                        <td class="status status-${c.status}">${m.icon}</td>
                        <td class="name">${this.escapeHtml(c.name)}</td>
                        <td class="details">${this.escapeHtml(c.details)}</td>
                    </tr>`;
                })
                .join('');
            const label = group === 'core' ? 'Core' : group.charAt(0).toUpperCase() + group.slice(1);
            return `<h2>${label}</h2><table><tr><th></th><th>Check</th><th>Details</th></tr>${rows}</table>`;
        };

        const warnCount = result.checks.filter(c => c.status === 'warn').length;
        const fixedCount = result.checks.filter(c => c.status === 'fixed').length;
        const okCount = result.checks.filter(c => c.status === 'ok').length;

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reference — Doctor</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
        h1 { font-size: 1.5em; margin-bottom: 0.3em; }
        h2 { font-size: 1.15em; margin-top: 1.5em; margin-bottom: 0.4em; color: var(--vscode-foreground); }
        .summary { color: var(--vscode-descriptionForeground); margin-bottom: 1em; }
        .chips { display: flex; gap: 10px; margin: 12px 0 20px; }
        .chip { padding: 6px 14px; border-radius: 12px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
        .chip .n { font-weight: bold; font-size: 1.1em; }
        .chip .l { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-left: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        th, td { padding: 7px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
        th { font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
        td.status { width: 28px; text-align: center; font-weight: bold; font-size: 1.1em; }
        td.name { white-space: nowrap; font-weight: 500; }
        td.details { color: var(--vscode-descriptionForeground); }
        .status-ok { color: var(--vscode-testing-iconPassed); }
        .status-fixed { color: var(--vscode-testing-iconQueued); }
        .status-warn { color: var(--vscode-testing-iconFailed); }
    </style>
</head>
<body>
    <h1>Reference — Doctor</h1>
    <div class="summary">${this.escapeHtml(result.summary)}</div>
    <div class="chips">
        <div class="chip"><span class="n">${okCount}</span><span class="l">OK</span></div>
        <div class="chip"><span class="n">${fixedCount}</span><span class="l">Fixed</span></div>
        <div class="chip"><span class="n">${warnCount}</span><span class="l">Warn</span></div>
    </div>
    ${groups.map(renderGroup).join('')}
</body>
</html>`;
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ─── Global Commands ─────────────────────────────────────

    private async runGlobalDoctor(): Promise<void> {
        if (!this.requireBinary()) { return; }

        const mode = await vscode.window.showQuickPick(
            [
                { label: '$(warning) Issues only', description: 'Show only projects with problems', value: 'issues' as const },
                { label: '$(list-tree) All projects', description: 'Show every project', value: 'all' as const },
            ],
            { placeHolder: 'Global health check scope' },
        );
        if (!mode) { return; }

        await vscode.window.withProgress(
            { title: 'Running global doctor...', location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.runGlobalDoctor({ issuesOnly: mode.value === 'issues' });
                if (result.success && result.data) {
                    const panel = vscode.window.createWebviewPanel(
                        'reference.globalDoctor',
                        'Reference — Global Doctor',
                        vscode.ViewColumn.Active,
                        { enableScripts: false },
                    );
                    panel.webview.html = this.renderGlobalDoctorHtml(result.data);
                    const s = result.data.summary;
                    vscode.window.showInformationMessage(
                        `Global doctor: ${s.healthy}/${s.total_projects} healthy, ${s.with_issues} with issues.`,
                    );
                } else {
                    vscode.window.showErrorMessage(`Global doctor failed: ${result.error}`);
                }
            },
        );
    }

    private renderGlobalDoctorHtml(result: GlobalDoctorResult): string {
        const s = result.summary;
        const rows = result.projects.map(p => {
            const icon = p.healthy ? '✓' : (p.exists ? '!' : '✕');
            const cls = p.healthy ? 'ok' : (p.exists ? 'warn' : 'dead');
            const name = p.project_dir.split(/[\\/]/).pop() || p.project_dir;
            const agents = (p.agents || []).join(', ') || '—';
            const issueDetails = p.checks
                .filter(c => c.status === 'warn')
                .map(c => this.escapeHtml(c.name))
                .join('; ');
            return `<tr>
                <td class="status status-${cls}">${icon}</td>
                <td class="name" title="${this.escapeHtml(p.project_dir)}">${this.escapeHtml(name)}</td>
                <td>${p.repo_count}</td>
                <td class="agents">${this.escapeHtml(agents)}</td>
                <td class="details">${issueDetails || (p.healthy ? '—' : '—')}</td>
            </tr>`;
        }).join('');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reference — Global Doctor</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
        h1 { font-size: 1.5em; margin-bottom: 0.3em; }
        .chips { display: flex; gap: 10px; margin: 12px 0 20px; flex-wrap: wrap; }
        .chip { padding: 6px 14px; border-radius: 12px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
        .chip .n { font-weight: bold; font-size: 1.1em; }
        .chip .l { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-left: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        th, td { padding: 7px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
        th { font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
        td.status { width: 28px; text-align: center; font-weight: bold; font-size: 1.1em; }
        td.name { white-space: nowrap; font-weight: 500; }
        td.agents { color: var(--vscode-descriptionForeground); white-space: nowrap; }
        td.details { color: var(--vscode-descriptionForeground); }
        .status-ok { color: var(--vscode-testing-iconPassed); }
        .status-warn { color: var(--vscode-testing-iconQueued); }
        .status-dead { color: var(--vscode-testing-iconFailed); }
    </style>
</head>
<body>
    <h1>Reference — Global Doctor</h1>
    <div class="chips">
        <div class="chip"><span class="n">${s.total_projects}</span><span class="l">Total</span></div>
        <div class="chip"><span class="n">${s.healthy}</span><span class="l">Healthy</span></div>
        <div class="chip"><span class="n">${s.with_issues}</span><span class="l">Issues</span></div>
        <div class="chip"><span class="n">${s.deleted}</span><span class="l">Missing dir</span></div>
    </div>
    <table>
        <tr><th></th><th>Project</th><th>Repos</th><th>Agents</th><th>Issues</th></tr>
        ${rows}
    </table>
</body>
</html>`;
    }

    private async runGlobalGc(): Promise<void> {
        if (!this.requireBinary()) { return; }

        const scope = await vscode.window.showQuickPick(
            [
                { label: '$(trash) Stale records only', description: 'Remove DB entries for deleted project dirs', value: false as const },
                { label: '$(trash) Records + orphan cache', description: 'Also delete unreferenced cache dirs (reclaims disk)', value: true as const },
            ],
            { placeHolder: 'Select cleanup scope' },
        );
        if (!scope) { return; }

        // Step 1: dry-run preview
        const preview = await vscode.window.withProgress(
            { title: 'Scanning for cleanup...', location: vscode.ProgressLocation.Notification },
            () => this.cli.runGlobalGcPreview(scope.value),
        );
        if (!preview.success) {
            vscode.window.showErrorMessage(`Cleanup scan failed: ${preview.error}`);
            return;
        }

        const output = (preview.data || '').trim();
        if (output.includes('一切正常') || output.includes('无需清理')) {
            vscode.window.showInformationMessage('Nothing to clean up. Everything is tidy.');
            return;
        }

        // Show preview in output channel
        this.outputChannel.show(true);
        this.outputChannel.appendLine('\n─── GC Preview ───');
        this.outputChannel.appendLine(output);
        this.outputChannel.appendLine('──────────────────\n');

        // Step 2: confirm and execute
        const confirm = await vscode.window.showWarningMessage(
            'Review the preview in the Output panel. Proceed with cleanup?',
            { modal: true },
            'Clean up',
        );
        if (confirm !== 'Clean up') { return; }

        await vscode.window.withProgress(
            { title: 'Cleaning up...', location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.runGlobalGcExecute(scope.value);
                if (result.success) {
                    const msg = (result.data || '').trim() || 'Cleanup complete.';
                    vscode.window.showInformationMessage(msg);
                    this.refreshAll();
                } else {
                    vscode.window.showErrorMessage(`Cleanup failed: ${result.error}`);
                }
            },
        );
    }

    private async runGlobalList(): Promise<void> {
        if (!this.requireBinary()) { return; }

        await vscode.window.withProgress(
            { title: 'Loading global project list...', location: vscode.ProgressLocation.Notification },
            async () => {
                const result = await this.cli.runGlobalList();
                if (result.success && result.data) {
                    const panel = vscode.window.createWebviewPanel(
                        'reference.globalList',
                        'Reference — All Projects',
                        vscode.ViewColumn.Active,
                        { enableScripts: false },
                    );
                    panel.webview.html = this.renderGlobalListHtml(result.data);
                    vscode.window.showInformationMessage(
                        `${result.data.total_projects} projects, ${result.data.projects.reduce((s, p) => s + p.repo_count, 0)} references.`,
                    );
                } else {
                    vscode.window.showErrorMessage(`Global list failed: ${result.error}`);
                }
            },
        );
    }

    private renderGlobalListHtml(result: GlobalListResult): string {
        const sorted = [...result.projects].sort((a, b) => {
            // missing dirs last, then by name
            if (a.exists !== b.exists) { return a.exists ? -1 : 1; }
            return (a.project_dir.split(/[\\/]/).pop() || '').localeCompare(b.project_dir.split(/[\\/]/).pop() || '');
        });

        const totalRepos = sorted.reduce((s, p) => s + p.repo_count, 0);
        const broken = sorted.reduce((s, p) => s + p.broken_count, 0);
        const missing = sorted.filter(p => !p.exists).length;

        const projects = sorted.map(p => {
            const name = p.project_dir.split(/[\\/]/).pop() || p.project_dir;
            const agents = (p.agents || []).join(', ') || '—';
            const statusCls = p.exists ? (p.broken_count > 0 ? 'warn' : 'ok') : 'dead';
            const statusIcon = p.exists ? (p.broken_count > 0 ? '!' : '✓') : '✕';
            const statusLabel = p.exists ? (p.broken_count > 0 ? `${p.broken_count} broken` : 'healthy') : 'missing dir';
            const repos = (p.repos || []).map(r => {
                const rIcon = r.type === 'local' ? 'folder' : 'globe';
                return `<span class="repo-tag" title="${this.escapeHtml(r.ref_name)} (${r.type})">${this.escapeHtml(r.ref_name)}</span>`;
            }).join('') || '<span class="muted">none</span>';
            return `<tr class="${p.exists ? '' : 'missing'}">
                <td class="status status-${statusCls}" title="${statusLabel}">${statusIcon}</td>
                <td class="name" title="${this.escapeHtml(p.project_dir)}">${this.escapeHtml(name)}${p.initialized ? '' : ' <span class="badge">uninit</span>'}</td>
                <td>${p.repo_count}</td>
                <td class="agents">${this.escapeHtml(agents)}</td>
                <td class="repos">${repos}</td>
            </tr>`;
        }).join('');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reference — All Projects</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
        h1 { font-size: 1.5em; margin-bottom: 0.3em; }
        .chips { display: flex; gap: 10px; margin: 12px 0 20px; flex-wrap: wrap; }
        .chip { padding: 6px 14px; border-radius: 12px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
        .chip .n { font-weight: bold; font-size: 1.1em; }
        .chip .l { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-left: 4px; }
        .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
        th { font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
        td.status { width: 28px; text-align: center; font-weight: bold; }
        td.name { white-space: nowrap; font-weight: 500; }
        td.agents { color: var(--vscode-descriptionForeground); white-space: nowrap; }
        td.repos { max-width: 480px; }
        .repo-tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 7px; border-radius: 9px; font-size: 0.8em; margin: 1px 3px; white-space: nowrap; }
        .badge { background: var(--vscode-inputOption-activeBorder); color: var(--vscode-descriptionForeground); padding: 0 5px; border-radius: 4px; font-size: 0.75em; font-weight: normal; }
        .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
        tr.missing td { opacity: 0.6; }
        .status-ok { color: var(--vscode-testing-iconPassed); }
        .status-warn { color: var(--vscode-testing-iconQueued); }
        .status-dead { color: var(--vscode-testing-iconFailed); }
    </style>
</head>
<body>
    <h1>Reference — All Projects</h1>
    <div class="chips">
        <div class="chip"><span class="n">${result.total_projects}</span><span class="l">Projects</span></div>
        <div class="chip"><span class="n">${totalRepos}</span><span class="l">References</span></div>
        <div class="chip"><span class="n">${broken}</span><span class="l">Broken</span></div>
        <div class="chip"><span class="n">${missing}</span><span class="l">Missing</span></div>
    </div>
    <div class="hint">To remove a reference or clean up, use the command palette: <code>Reference: Remove Global Reference</code></div>
    <table>
        <tr><th></th><th>Project</th><th>Repos</th><th>Agents</th><th>References</th></tr>
        ${projects}
    </table>
</body>
</html>`;
    }

    private async runGlobalRemove(): Promise<void> {
        if (!this.requireBinary()) { return; }

        // Step 1: load projects
        const listResult = await this.cli.runGlobalList();
        if (!listResult.success || !listResult.data) {
            vscode.window.showErrorMessage(`Failed to load projects: ${listResult.error}`);
            return;
        }
        const projects = listResult.data.projects;
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No projects found.');
            return;
        }

        // Step 2: pick a project
        const projectPick = await vscode.window.showQuickPick(
            projects.map(p => {
                const name = p.project_dir.split(/[\\/]/).pop() || p.project_dir;
                const tag = p.exists ? (p.broken_count > 0 ? '⚠ broken' : '') : '✕ missing';
                return {
                    label: name,
                    description: tag || (p.repo_count > 0 ? `${p.repo_count} repos` : ''),
                    detail: p.project_dir,
                    project: p,
                };
            }),
            { placeHolder: 'Select a project', title: 'Reference — Remove Global Reference' },
        );
        if (!projectPick) { return; }

        // Step 3: pick repo or all
        const targetPick = await vscode.window.showQuickPick(
            [
                { label: '$(trash) All references', description: 'Remove every reference from this project', mode: 'all' as const },
                ...projectPick.project.repos.map(r => ({
                    label: `$(link) ${r.ref_name}`,
                    description: r.type,
                    detail: r.name,
                    mode: 'one' as const,
                    refName: r.ref_name,
                })),
            ],
            { placeHolder: `Select what to remove from "${projectPick.label}"` },
        );
        if (!targetPick) { return; }

        // Step 4: confirm
        const what = targetPick.mode === 'all' ? 'ALL references' : `"${(targetPick as any).refName}"`;
        const confirm = await vscode.window.showWarningMessage(
            `Remove ${what} from "${projectPick.label}"?`,
            { modal: true },
            'Remove',
        );
        if (confirm !== 'Remove') { return; }

        // Step 5: execute
        await vscode.window.withProgress(
            { title: `Removing ${what}...`, location: vscode.ProgressLocation.Notification },
            async () => {
                const result = targetPick.mode === 'all'
                    ? await this.cli.runGlobalRemoveAll(projectPick.project.project_dir)
                    : await this.cli.runGlobalRemove(projectPick.project.project_dir, (targetPick as any).refName);
                if (result.success) {
                    vscode.window.showInformationMessage(`Removed ${what} from "${projectPick.label}".`);
                    this.refreshAll();
                } else {
                    vscode.window.showErrorMessage(`Remove failed: ${result.error}`);
                }
            },
        );
    }

    private async wikiCommit(): Promise<void> {
        if (!this.requireBinary()) { return; }
        const targets = await this.pickWikiTargets('commit changes to');
        if (!targets) { return; }

        const ok: string[] = [];
        for (const local of targets) {
            const result = await this.cli.wikiCommit(local);
            if (result.success) {
                ok.push(local ? 'Local' : 'Remote');
            } else {
                vscode.window.showErrorMessage(`Wiki commit (${local ? 'local' : 'remote'}) failed: ${result.error}`);
                return; // stop on first failure; remote and localwiki are independent git repos
            }
        }
        vscode.window.showInformationMessage(`Wiki changes committed (${ok.join(' + ')}).`);
        this.refreshAll();
    }

    private async wikiSync(): Promise<void> {
        if (!this.requireBinary()) { return; }
        const targets = await this.pickWikiTargets('sync');
        if (!targets) { return; }

        await vscode.window.withProgress(
            { title: 'Syncing wiki...', location: vscode.ProgressLocation.Notification },
            async () => {
                const ok: string[] = [];
                for (const local of targets) {
                    const result = await this.cli.wikiSync(local);
                    if (result.success) {
                        ok.push(local ? 'Local' : 'Remote');
                    } else {
                        vscode.window.showErrorMessage(`Wiki sync (${local ? 'local' : 'remote'}) failed: ${result.error}`);
                        return; // stop on first failure
                    }
                }
                vscode.window.showInformationMessage(`Wiki synced (${ok.join(' + ')}).`);
                this.refreshAll();
            },
        );
    }

    /** Pick which wiki(s) to operate on. Returns undefined if cancelled. */
    private async pickWikiTargets(action: string): Promise<boolean[] | undefined> {
        const pick = await vscode.window.showQuickPick(
            [
                { label: '$(globe) Remote Wiki', description: 'Public knowledge base for remote repos', targets: [false] },
                { label: '$(folder) Local Knowledge Base', description: 'localwiki for local repos', targets: [true] },
                { label: '$(sync) Both', description: 'Remote then Local', targets: [false, true] },
            ],
            { placeHolder: `Select knowledge base to ${action}` },
        );
        return pick?.targets;
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
