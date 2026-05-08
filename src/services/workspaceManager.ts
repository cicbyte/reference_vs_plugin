import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MapEntry, TopicEntry } from '../types';

export class WorkspaceManager {
    private watchers: vscode.FileSystemWatcher[] = [];
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private outputChannel: vscode.OutputChannel) {}

    getWorkspaceRoot(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    getReferenceDir(): string | undefined {
        const root = this.getWorkspaceRoot();
        return root ? path.join(root, '.reference') : undefined;
    }

    getReposDir(): string | undefined {
        const refDir = this.getReferenceDir();
        return refDir ? path.join(refDir, 'repos') : undefined;
    }

    getWikiDir(): string | undefined {
        const refDir = this.getReferenceDir();
        return refDir ? path.join(refDir, 'wiki') : undefined;
    }

    readMapFile(): MapEntry[] {
        const refDir = this.getReferenceDir();
        if (!refDir) { return []; }

        const mapPath = path.join(refDir, 'reference.map.jsonl');
        if (!fs.existsSync(mapPath)) { return []; }

        try {
            const content = fs.readFileSync(mapPath, 'utf-8');
            return content
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line) as MapEntry);
        } catch (e) {
            this.outputChannel.appendLine(`Failed to read map file: ${e}`);
            return [];
        }
    }

    getWikiFiles(repoName: string): string[] {
        const wikiDir = this.getWikiDir();
        if (!wikiDir) { return []; }

        const repoWiki = path.join(wikiDir, repoName);
        if (!fs.existsSync(repoWiki)) { return []; }

        try {
            return fs.readdirSync(repoWiki)
                .filter(f => f.endsWith('.md'))
                .sort();
        } catch {
            return [];
        }
    }

    getRepoNames(): string[] {
        const reposDir = this.getReposDir();
        if (!reposDir || !fs.existsSync(reposDir)) { return []; }

        try {
            return fs.readdirSync(reposDir)
                .filter(name => {
                    try {
                        return fs.statSync(path.join(reposDir, name)).isDirectory();
                    } catch { return false; }
                })
                .sort();
        } catch {
            return [];
        }
    }

    startWatching(): void {
        this.stopWatching();
        const refDir = this.getReferenceDir();
        if (!refDir) { return; }

        const patterns = [
            new vscode.RelativePattern(
                vscode.workspace.workspaceFolders![0],
                '.reference/**'
            ),
        ];

        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            watcher.onDidCreate(() => this._onDidChange.fire());
            watcher.onDidChange(() => this._onDidChange.fire());
            watcher.onDidDelete(() => this._onDidChange.fire());
            this.watchers.push(watcher);
        }

        this.outputChannel.appendLine('Started watching .reference/ directory');
    }

    stopWatching(): void {
        for (const w of this.watchers) { w.dispose(); }
        this.watchers = [];
    }

    dispose(): void {
        this.stopWatching();
        this._onDidChange.dispose();
    }
}
