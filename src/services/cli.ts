import * as vscode from 'vscode';
import { BinaryManager } from './binaryManager';
import { RepoEntry, SccEntry, GlobalStats, DoctorResult, GlobalDoctorResult, GlobalListResult, CliResult } from '../types';
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

    /** Run a command with `-f json` and parse a single JSON object. Use for commands
     *  whose top-level JSON is an object (e.g. doctor returns {project_dir, checks, summary}). */
    private async runJsonObject<T>(args: string[], cwdOverride?: string): Promise<CliResult<T>> {
        const execCwd = cwdOverride ?? this.cwd();
        try {
            const { stdout, stderr } = await this.binary.exec([...args, '-f', 'json'], { cwd: execCwd });
            if (stderr) {
                this.outputChannel.appendLine(`[stderr] ${stderr}`);
            }
            const trimmed = stdout.trim();
            if (!trimmed) {
                return { success: true, data: undefined as T };
            }
            return { success: true, data: JSON.parse(trimmed) as T };
        } catch (e: any) {
            const msg = e.message || String(e);
            this.outputChannel.appendLine(`[error] ${args.join(' ')}: ${msg}`);
            return { success: false, error: msg };
        }
    }

    private async runText(args: string[], cwdOverride?: string): Promise<CliResult<string>> {
        const execCwd = cwdOverride ?? this.cwd();
        this.outputChannel.appendLine(`[runText] cwd=${execCwd}`);
        try {
            const { stdout, stderr } = await this.binary.exec(args, { cwd: execCwd });
            if (stderr && !stdout) {
                this.outputChannel.appendLine(`[runText] Warning: empty stdout, stderr has content`);
            }
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

    async addRepo(url: string, name?: string, options?: { branch?: string; update?: boolean; local?: boolean }): Promise<CliResult<string>> {
        const args = ['repo', 'add'];
        if (options?.local) { args.push('--local'); }
        if (name) { args.push('--name', name); }
        if (options?.branch) { args.push('--branch', options.branch); }
        if (options?.update) { args.push('--update'); }
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

    /** Structured doctor result via `-f json` (project_dir + checks[] + summary). */
    async runDoctorStructured(): Promise<CliResult<DoctorResult>> {
        return this.runJsonObject<DoctorResult>(['doctor']);
    }

    /** Global cross-project health check via `-f json`. */
    async runGlobalDoctor(options?: { issuesOnly?: boolean; concurrency?: number }): Promise<CliResult<GlobalDoctorResult>> {
        const args = ['global', 'doctor', '-f', 'json'];
        if (options?.issuesOnly) { args.push('--issues-only'); }
        if (options?.concurrency) { args.push('--concurrency', String(options.concurrency)); }
        const execCwd = this.cwd();
        try {
            const { stdout, stderr } = await this.binary.exec(args, { cwd: execCwd });
            if (stderr) {
                this.outputChannel.appendLine(`[stderr] ${stderr}`);
            }
            const trimmed = stdout.trim();
            if (!trimmed) {
                return { success: true, data: undefined as unknown as GlobalDoctorResult };
            }
            return { success: true, data: JSON.parse(trimmed) as GlobalDoctorResult };
        } catch (e: any) {
            const msg = e.message || String(e);
            this.outputChannel.appendLine(`[error] ${args.join(' ')}: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /** Global GC preview (dry-run). CLI has no JSON mode for gc, so output is text. */
    async runGlobalGcPreview(cleanCache = false): Promise<CliResult<string>> {
        const args = ['global', 'gc', '--dry-run'];
        if (cleanCache) { args.push('--cache'); }
        return this.runText(args);
    }

    /** Global GC execute. Pass --yes to skip CLI's interactive prompt. */
    async runGlobalGcExecute(cleanCache = false): Promise<CliResult<string>> {
        const args = ['global', 'gc', '--yes'];
        if (cleanCache) { args.push('--cache'); }
        return this.runText(args);
    }

    /** Global list: all projects and their repo references via `-f json`. */
    async runGlobalList(): Promise<CliResult<GlobalListResult>> {
        const execCwd = this.cwd();
        try {
            const { stdout, stderr } = await this.binary.exec(['global', 'list', '-f', 'json'], { cwd: execCwd });
            if (stderr) {
                this.outputChannel.appendLine(`[stderr] ${stderr}`);
            }
            const trimmed = stdout.trim();
            if (!trimmed) {
                return { success: true, data: { projects: [], total_projects: 0 } };
            }
            return { success: true, data: JSON.parse(trimmed) as GlobalListResult };
        } catch (e: any) {
            const msg = e.message || String(e);
            this.outputChannel.appendLine(`[error] global list: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /** Global remove: remove a repo from a specific project. --yes skips prompt. */
    async runGlobalRemove(projectDir: string, refName: string, purge = false): Promise<CliResult<string>> {
        const args = ['global', 'remove', '--project', projectDir, '--repo', refName, '--yes'];
        if (purge) { args.push('--purge'); }
        return this.runText(args);
    }

    /** Global remove all references from a project. */
    async runGlobalRemoveAll(projectDir: string, purge = false): Promise<CliResult<string>> {
        const args = ['global', 'remove', '--project', projectDir, '--all', '--yes'];
        if (purge) { args.push('--purge'); }
        return this.runText(args);
    }

    async wikiCommit(local = false): Promise<CliResult<string>> {
        const args = ['wiki', 'commit'];
        if (local) { args.push('--local'); }
        return this.runText(args);
    }

    async wikiSync(local = false): Promise<CliResult<string>> {
        const args = ['wiki', 'sync'];
        if (local) { args.push('--local'); }
        return this.runText(args);
    }

}
