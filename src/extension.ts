import * as vscode from 'vscode';
import { BinaryManager } from './services/binaryManager';
import { ReferenceCLI } from './services/cli';
import { WorkspaceManager } from './services/workspaceManager';
import { RepoTreeProvider, WikiTreeProvider, ActionsTreeProvider } from './ui/treeView';
import { StatusBar } from './ui/statusBar';
import { CommandRegistrar } from './ui/commands';

function updateContexts(binary: BinaryManager, ws: WorkspaceManager) {
    vscode.commands.executeCommand('setContext', 'reference:hasBinary', !!binary.getBinaryPath());
    vscode.commands.executeCommand('setContext', 'reference:initialized', ws.isInitialized());
}

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Reference');
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine('Activating Reference extension...');

    // Services
    const binary = new BinaryManager(outputChannel);
    const ws = new WorkspaceManager(outputChannel);
    const cli = new ReferenceCLI(binary, ws, outputChannel);

    // Detect binary
    await binary.detect();
    outputChannel.appendLine(`Binary: ${binary.getBinaryPath() || 'not found'}`);
    outputChannel.appendLine(`Initialized: ${ws.isInitialized()}`);

    // Set initial contexts
    updateContexts(binary, ws);

    // Tree providers
    const repoTree = new RepoTreeProvider(ws, outputChannel);
    const wikiTree = new WikiTreeProvider(ws);
    const actionsTree = new ActionsTreeProvider(ws);

    // Register tree views
    const repoView = vscode.window.createTreeView('reference.repos', {
        treeDataProvider: repoTree,
        showCollapseAll: true,
    });
    const wikiView = vscode.window.createTreeView('reference.wiki', {
        treeDataProvider: wikiTree,
        showCollapseAll: true,
    });
    vscode.window.createTreeView('reference.actions', {
        treeDataProvider: actionsTree,
    });

    context.subscriptions.push(repoView, wikiView);

    // Status bar
    const statusBar = new StatusBar(binary, ws);
    statusBar.init();
    context.subscriptions.push(statusBar);

    // Commands
    const commands = new CommandRegistrar(cli, binary, ws, repoTree, wikiTree, statusBar, outputChannel);
    commands.registerAll(context);

    // File watching
    const config = vscode.workspace.getConfiguration('reference');
    if (config.get<boolean>('autoRefresh') && vscode.workspace.workspaceFolders) {
        ws.startWatching();
        ws.onDidChange(() => {
            repoTree.refresh();
            wikiTree.refresh();
            statusBar.update();
            updateContexts(binary, ws);
        });
    }
    context.subscriptions.push(ws);

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('reference.binaryPath')) {
                binary.detect().then(() => {
                    statusBar.update();
                    updateContexts(binary, ws);
                });
            }
            if (e.affectsConfiguration('reference.autoRefresh')) {
                const newConfig = vscode.workspace.getConfiguration('reference');
                if (newConfig.get<boolean>('autoRefresh') && vscode.workspace.workspaceFolders) {
                    ws.startWatching();
                } else {
                    ws.stopWatching();
                }
            }
        }),
    );

    outputChannel.appendLine('Reference extension activated.');
}

export function deactivate() {}
