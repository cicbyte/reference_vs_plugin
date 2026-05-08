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
        repoDir: string,
    ) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = mapEntry.type === 'remote' ? mapEntry.full_name : '(local)';
        this.contextValue = 'repo';
        this.resourceUri = vscode.Uri.file(repoDir);
        this.iconPath = vscode.ThemeIcon.File;
        this.tooltip = `${mapEntry.description || ''}\nCommit: ${mapEntry.commit}\nType: ${mapEntry.type}`;
    }
}

class RepoDirItem extends BaseTreeItem {
    readonly kind = 'repoDir';
    constructor(
        public readonly dirPath: string,
        name: string,
    ) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'repoDir';
        this.iconPath = vscode.ThemeIcon.Folder;
        this.resourceUri = vscode.Uri.file(dirPath);
    }
}

class RepoFileItem extends BaseTreeItem {
    readonly kind = 'repoFile';
    constructor(
        public readonly filePath: string,
        name: string,
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'repoFile';
        this.iconPath = vscode.ThemeIcon.File;
        this.resourceUri = vscode.Uri.file(filePath);
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [this.resourceUri],
        };
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

// ─── Helper: list directory children ─────────────────────────────

const IGNORED_ENTRIES = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db']);

function listDirChildren(dirPath: string): BaseTreeItem[] {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const items: BaseTreeItem[] = [];

        // Dirs first, then files; both sorted
        const dirs = entries.filter(e => e.isDirectory() && !IGNORED_ENTRIES.has(e.name)).sort((a, b) => a.name.localeCompare(b.name));
        const files = entries.filter(e => e.isFile() && !IGNORED_ENTRIES.has(e.name)).sort((a, b) => a.name.localeCompare(b.name));

        for (const d of dirs) {
            items.push(new RepoDirItem(path.join(dirPath, d.name), d.name));
        }
        for (const f of files) {
            items.push(new RepoFileItem(path.join(dirPath, f.name), f.name));
        }
        return items;
    } catch {
        return [];
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
            const mapEntries = this.ws.readMapFile();
            if (mapEntries.length === 0) { return []; }
            const reposDir = this.ws.getReposDir();
            return mapEntries
                .filter(entry => {
                    const repoPath = path.join(reposDir!, entry.ref_name);
                    return fs.existsSync(repoPath);
                })
                .map(entry => {
                    const repoPath = path.join(reposDir!, entry.ref_name);
                    return new RepoTreeItem(entry.ref_name, entry, repoPath);
                });
        }

        if (element instanceof RepoTreeItem) {
            // Show repo source directory contents
            const reposDir = this.ws.getReposDir();
            const repoPath = path.join(reposDir!, element.name);
            return listDirChildren(repoPath);
        }

        if (element instanceof RepoDirItem) {
            return listDirChildren(element.dirPath);
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
