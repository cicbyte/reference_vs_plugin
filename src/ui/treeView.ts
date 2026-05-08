import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MapEntry } from '../types';
import { WorkspaceManager } from '../services/workspaceManager';

// ─── Tree Item Types ─────────────────────────────────────────────

abstract class BaseTreeItem extends vscode.TreeItem {
    abstract readonly kind: string;
}

class RepoTreeItem extends BaseTreeItem {
    readonly kind = 'repo';
    constructor(
        public readonly name: string,
        public readonly mapEntry: MapEntry,
    ) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = mapEntry.type === 'remote' ? mapEntry.full_name : '(local)';
        this.contextValue = 'repo';
        this.iconPath = new vscode.ThemeIcon(
            mapEntry.type === 'remote' ? 'repo' : 'folder-library',
        );
        this.tooltip = `${mapEntry.description || ''}\nCommit: ${mapEntry.commit}\nType: ${mapEntry.type}`;
    }
}

class WikiFileTreeItem extends BaseTreeItem {
    readonly kind = 'wikiFile';
    constructor(
        public readonly fileName: string,
        public readonly filePath: string,
        public readonly repoName: string,
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'wikiFile';
        this.iconPath = new vscode.ThemeIcon('file-text');
        this.command = {
            command: 'reference.openWikiFile',
            title: 'Open',
            arguments: [this],
        };
        this.tooltip = filePath;
    }
}

class RepoWikiGroupItem extends BaseTreeItem {
    readonly kind = 'wikiGroup';
    constructor(
        public readonly repoName: string,
        public readonly filePaths: WikiFileTreeItem[],
    ) {
        super(repoName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'wikiGroup';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = `${filePaths.length} files`;
    }
}

class ActionTreeItem extends BaseTreeItem {
    readonly kind = 'action';
    constructor(label: string, commandId: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'action';
        this.iconPath = new vscode.ThemeIcon(icon);
        this.command = { command: commandId, title: label };
    }
}

// ─── Repo Tree Provider ──────────────────────────────────────────

export class RepoTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
    private _onDidChangeTree = new vscode.EventEmitter<BaseTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTree.event;

    constructor(
        private ws: WorkspaceManager,
        private outputChannel: vscode.OutputChannel,
    ) {}

    refresh(): void {
        this._onDidChangeTree.fire(undefined);
    }

    getTreeItem(element: BaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BaseTreeItem): Promise<BaseTreeItem[]> {
        if (!this.ws.getWorkspaceRoot()) { return []; }

        if (!element) {
            // Root: show repos
            const mapEntries = this.ws.readMapFile();
            if (mapEntries.length === 0) { return []; }
            return mapEntries.map(entry => new RepoTreeItem(entry.ref_name, entry));
        }

        if (element instanceof RepoTreeItem) {
            // Show sub-info for a repo
            const files = this.ws.getWikiFiles(element.name);
            if (files.length === 0) { return []; }
            const wikiDir = this.ws.getWikiDir();
            return files.map(f => new WikiFileTreeItem(
                f,
                path.join(wikiDir!, element.name, f),
                element.name,
            ));
        }

        return [];
    }
}

// ─── Wiki Tree Provider ──────────────────────────────────────────

export class WikiTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
    private _onDidChangeTree = new vscode.EventEmitter<BaseTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTree.event;

    constructor(
        private ws: WorkspaceManager,
    ) {}

    refresh(): void {
        this._onDidChangeTree.fire(undefined);
    }

    getTreeItem(element: BaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BaseTreeItem): Promise<BaseTreeItem[]> {
        if (!this.ws.getWorkspaceRoot()) { return []; }

        if (!element) {
            // Root: group wiki files by repo
            const mapEntries = this.ws.readMapFile();
            const groups: BaseTreeItem[] = [];
            for (const entry of mapEntries) {
                const files = this.ws.getWikiFiles(entry.ref_name);
                if (files.length > 0) {
                    const wikiDir = this.ws.getWikiDir();
                    const fileItems = files.map(f => new WikiFileTreeItem(
                        f,
                        path.join(wikiDir!, entry.ref_name, f),
                        entry.ref_name,
                    ));
                    groups.push(new RepoWikiGroupItem(entry.ref_name, fileItems));
                }
            }
            return groups;
        }

        if (element instanceof RepoWikiGroupItem) {
            return element.filePaths;
        }

        return [];
    }
}

// ─── Actions Tree Provider ───────────────────────────────────────

export class ActionsTreeProvider implements vscode.TreeDataProvider<ActionTreeItem> {
    private _onDidChangeTree = new vscode.EventEmitter<ActionTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTree.event;

    getTreeItem(element: ActionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<ActionTreeItem[]> {
        return [
            new ActionTreeItem('Add Repository', 'reference.addRepo', 'add'),
            new ActionTreeItem('Update All Repositories', 'reference.updateAllRepos', 'sync'),
            new ActionTreeItem('Check Installation', 'reference.checkBinary', 'eye'),
            new ActionTreeItem('Show Diagnostics', 'reference.diagnostics', 'output'),
            new ActionTreeItem('Open Cache Directory', 'reference.browseCache', 'folder-opened'),
        ];
    }
}
