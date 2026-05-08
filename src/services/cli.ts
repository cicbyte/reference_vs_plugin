import * as vscode from 'vscode';
import { BinaryManager } from './binaryManager';
import { RepoEntry, SccEntry, GlobalStats, CliResult } from '../types';

export class ReferenceCLI {
    constructor(
        private binary: BinaryManager,
        private outputChannel: vscode.OutputChannel,
    ) {}

    private async runJson<T>(args: string[], cwd?: string): Promise<CliResult<T>> {
        try {
            const { stdout, stderr } = await this.binary.exec([...args, '-f', 'jsonl'], { cwd });
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

    private async runText(args: string[], cwd?: string): Promise<CliResult<string>> {
        try {
            const { stdout, stderr } = await this.binary.exec(args, { cwd });
            if (stderr) {
                this.outputChannel.appendLine(`[stderr] ${stderr}`);
            }
            return { success: true, data: stdout, rawOutput: stdout };
        } catch (e: any) {
            const msg = e.message || String(e);
            this.outputChannel.appendLine(`[error] ${args.join(' ')}: ${msg}`);
            return { success: false, error: msg };
        }
    }

    async listRepos(cwd?: string): Promise<CliResult<RepoEntry[]>> {
        const result = await this.runJson<RepoEntry[]>(['repo', 'list'], cwd);
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

    async updateRepo(identifier?: string, cwd?: string): Promise<CliResult<string>> {
        const args = ['repo', 'update'];
        if (identifier) { args.push(identifier); }
        return this.runText(args, cwd);
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

    async getGlobalStats(): Promise<CliResult<GlobalStats>> {
        return this.runJson<GlobalStats>(['global', 'stats']);
    }

    async getVersion(): Promise<CliResult<string>> {
        return this.runText(['version']);
    }

    async runDoctor(): Promise<CliResult<string>> {
        return this.runText(['doctor']);
    }

}
