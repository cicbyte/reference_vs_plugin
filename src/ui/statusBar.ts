import * as vscode from 'vscode';
import { BinaryManager } from '../services/binaryManager';
import { WorkspaceManager } from '../services/workspaceManager';

export class StatusBar {
    private item: vscode.StatusBarItem;

    constructor(
        private binary: BinaryManager,
        private ws: WorkspaceManager,
    ) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            50,
        );
        this.item.command = 'reference.listRepos';
    }

    init(): void {
        this.update();
        this.binary.onDidChange(() => this.update());
        this.ws.onDidChange(() => this.update());
    }

    update(): void {
        const hasBinary = !!this.binary.getBinaryPath();
        if (!hasBinary) {
            this.item.text = '$(error) reference: not found';
            this.item.tooltip = 'Reference CLI not detected. Click to check.';
            this.item.show();
            vscode.commands.executeCommand('setContext', 'reference:hasBinary', false);
            return;
        }

        vscode.commands.executeCommand('setContext', 'reference:hasBinary', true);
        const repos = this.ws.getAllRepos();
        const count = repos.length;
        this.item.text = `$(book) reference: ${count} repo${count !== 1 ? 's' : ''}`;
        this.item.tooltip = `${count} referenced repos. Click to list.`;
        this.item.show();
    }

    showSyncing(message: string): void {
        this.item.text = `$(sync~spin) reference: ${message}`;
    }

    dispose(): void {
        this.item.dispose();
    }
}
