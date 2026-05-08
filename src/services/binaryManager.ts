import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

const BINARY_NAME = 'reference';
// Windows may have .exe suffix
const BINARY_NAMES = process.platform === 'win32'
    ? ['reference.exe', 'reference']
    : ['reference'];

export class BinaryManager {
    private binaryPath: string | undefined;
    private _onDidChange = new vscode.EventEmitter<string | undefined>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private outputChannel: vscode.OutputChannel) {}

    async detect(): Promise<string | undefined> {
        // 1. Check user-configured path
        const configPath = vscode.workspace.getConfiguration('reference').get<string>('binaryPath');
        if (configPath) {
            if (fs.existsSync(configPath)) {
                this.binaryPath = configPath;
                this._onDidChange.fire(this.binaryPath);
                return this.binaryPath;
            }
            this.outputChannel.appendLine(`Configured binary path not found: ${configPath}`);
        }

        // 2. Search PATH
        const pathDirs = (process.env.PATH || '').split(path.delimiter);
        for (const dir of pathDirs) {
            for (const name of BINARY_NAMES) {
                const candidate = path.join(dir, name);
                if (fs.existsSync(candidate)) {
                    this.binaryPath = candidate;
                    this._onDidChange.fire(this.binaryPath);
                    return this.binaryPath;
                }
            }
        }

        // 3. Common install locations
        const commonPaths = this.getCommonPaths();
        for (const p of commonPaths) {
            for (const name of BINARY_NAMES) {
                const candidate = path.join(p, name);
                if (fs.existsSync(candidate)) {
                    this.binaryPath = candidate;
                    this._onDidChange.fire(this.binaryPath);
                    return this.binaryPath;
                }
            }
        }

        this.binaryPath = undefined;
        this._onDidChange.fire(undefined);
        return undefined;
    }

    getBinaryPath(): string | undefined {
        return this.binaryPath;
    }

    async getVersion(): Promise<string | undefined> {
        if (!this.binaryPath) { return undefined; }
        try {
            const { stdout } = await this.exec(['version']);
            // Parse version from output like "reference dev\n  commit: ...\n  built: ..."
            const lines = stdout.trim().split('\n');
            return lines[0] || undefined;
        } catch {
            return undefined;
        }
    }

    async validate(): Promise<{ valid: boolean; version?: string; error?: string }> {
        if (!this.binaryPath) {
            return { valid: false, error: 'Binary not found' };
        }
        try {
            const version = await this.getVersion();
            return { valid: true, version };
        } catch (e) {
            return { valid: false, error: String(e) };
        }
    }

    exec(args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            if (!this.binaryPath) {
                reject(new Error('reference binary not found'));
                return;
            }
            this.outputChannel.appendLine(`$ reference ${args.join(' ')} [cwd=${options?.cwd || 'default'}]`);
            execFile(
                this.binaryPath,
                args,
                {
                    cwd: options?.cwd,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 300_000,
                    env: process.env,
                },
                (err, stdout, stderr) => {
                    if (stdout) { this.outputChannel.appendLine(`[stdout] ${stdout.trimEnd()}`); }
                    if (stderr) { this.outputChannel.appendLine(`[stderr] ${stderr.trimEnd()}`); }
                    if (err) {
                        const detail = stderr ? `${err.message}\n${stderr}` : err.message;
                        reject(new Error(detail));
                    } else {
                        resolve({ stdout, stderr });
                    }
                }
            );
        });
    }

    spawn(args: string[], options?: { cwd?: string }) {
        if (!this.binaryPath) {
            throw new Error('reference binary not found');
        }
        const { spawn } = require('child_process');
        return spawn(this.binaryPath, args, {
            cwd: options?.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }

    private getCommonPaths(): string[] {
        const home = process.env.USERPROFILE || process.env.HOME || '';
        const paths: string[] = [];

        if (process.platform === 'win32') {
            paths.push(
                path.join(home, 'go', 'bin'),
                path.join(home, '.local', 'bin'),
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'reference'),
            );
        } else {
            paths.push(
                path.join(home, 'go', 'bin'),
                path.join(home, '.local', 'bin'),
                '/usr/local/bin',
            );
        }

        return paths;
    }
}
