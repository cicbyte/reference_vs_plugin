import * as vscode from 'vscode';
import { BinaryManager } from './binaryManager';
import { RepoEntry, SccEntry, GlobalStats, CliResult } from '../types';
import { WorkspaceManager } from './workspaceManager';

export class ReferenceCLI {
    constructor(
        private binary: BinaryManager,
        private ws: WorkspaceManager,
        private outputChannel: vscode.OutputChannel,
    ) {}

    private cwd(): string | undefined {
        return this.ws.getWorkspaceRoot();
    }

    private async runJson<T>(args: string[], cwdOverride?: string): Promise<CliResult<T>> {
        const execCwd = cwdOverride ?? this.cwd();
        try {
            const { stdout, stderr } = await this.binary.exec([...args, '-f', 'jsonl'], { cwd: execCwd });
            if (stderr) {
                this.outputChannel.appendLine(`[stderr] ${stderr}`);
            }
            // jsonl: one JSON object per line
            const lines = stdout.trim().split('\n').filter(l => l.trim());
            if (lines.length === 0) {
                return { success: true, data: undefined as T };
            }
            if (lines.length === 1) {
                return { success: true, data: JSON.parse(lines[0]) as T };
            }
            return { success: true, data: lines.map(l => JSON.parse(l)) as T };
        } catch (e: any) {
            const msg = e.message || String(e);
            this.outputChannel.appendLine(`[error] ${args.join(' ')}: ${msg}`);
            return { success: false, error: msg };
        }
    }

    private async runText(args: string[], cwdOverride?: string): Promise<CliResult<string>> {
        const execCwd = cwdOverride ?? this.cwd();
        try {
            const { stdout, stderr } = await this.binary.exec(args, { cwd: execCwd });
            return { success: true, data: stdout || stderr, rawOutput: stdout };
        } catch (e: any) {
            const msg = e.message || String(e);
            return { success: false, error: msg, rawOutput: msg };
        }
    }

    async listRepos(): Promise<CliResult<RepoEntry[]>> {
        const result = await this.runJson<RepoEntry[]>(['repo', 'list']);
        if (result.success && result.data) {
            // Single repo comes as object, multiple as array
            if (!Array.isArray(result.data)) {
                result.data = [result.data as any] as RepoEntry[];
            }
        }
        return result as CliResult<RepoEntry[]>;
    }

    async addRepo(url: string, name?: string, options?: { branch?: string; depth?: number; local?: boolean }): Promise<CliResult<string>> {
        const args = ['repo', 'add'];
        if (options?.local) { args.push('--local'); }
        if (name) { args.push('--name', name); }
        if (options?.branch) { args.push('--branch', options.branch); }
        if (options?.depth !== undefined) { args.push('--depth', String(options.depth)); }
        args.push(url);
        return this.runText(args);
    }

    async removeRepo(identifier: string, purge?: boolean): Promise<CliResult<string>> {
        const args = ['repo', 'remove', identifier, '--yes'];
        if (purge) { args.push('--purge'); }
        return this.runText(args);
    }

    async removeAllRepos(clean?: boolean): Promise<CliResult<string>> {
        const args = ['repo', 'remove', '--all', '--yes'];
        if (clean) { args.push('--clean'); }
        return this.runText(args);
    }

    async updateRepo(identifier?: string): Promise<CliResult<string>> {
        const args = ['repo', 'update'];
        if (identifier) { args.push(identifier); }
        return this.runText(args);
    }

    async getStats(repoName?: string): Promise<CliResult<SccEntry[]>> {
        const args = ['repo', 'scc'];
        if (repoName) { args.push(repoName); }
        const result = await this.runJson<SccEntry[]>(args);
        if (result.success && result.data && !Array.isArray(result.data)) {
            result.data = [result.data as any] as SccEntry[];
        }
        return result as CliResult<SccEntry[]>;
    }

    async init(agent: string = 'none'): Promise<CliResult<string>> {
        const args = ['init', '--agent', agent];
        return this.runText(args);
    }

    async getGlobalStats(): Promise<CliResult<GlobalStats>> {
        return this.runJson<GlobalStats>(['global', 'stats']);
    }

    async getVersion(): Promise<CliResult<string>> {
        return this.runText(['version']);
    }

    async runDoctor(): Promise<CliResult<string>> {
        return this.runText(['doctor']);
    }

    async wikiCommit(): Promise<CliResult<string>> {
        return this.runText(['wiki', 'commit']);
    }

    async wikiSync(): Promise<CliResult<string>> {
        return this.runText(['wiki', 'sync']);
    }

}
