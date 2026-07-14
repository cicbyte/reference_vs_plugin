export interface RepoEntry {
    type: 'remote' | 'local';
    name: string;
    source: string;
    cache_path: string;
    commit_at: string;
    branch: string;
}

export interface MapEntry {
    ref_name: string;
    type: 'remote' | 'local';
    platform: string;
    full_name: string;
    description: string;
    repo_path: string;
    wiki_path: string;
    commit: string;
    topics: TopicEntry[];
}

export interface TopicEntry {
    file: string;
    description: string;
    commit: string;
}

export interface SccLanguage {
    type: 'language';
    languages: string;
    files: number;
    lines: number;
    code: number;
    comments: number;
    blanks: number;
    complexity: number;
}

export interface SccTopFile {
    type: 'topFiles';
    filename: string;
    language: string;
    location: string;
    code: number;
    complexity: number;
}

export type SccEntry = SccLanguage | SccTopFile;

export interface GlobalStats {
    projects: { total: number; existing: number; deleted: number };
    repos: { total_cached: number };
    cache_size_bytes: number;
    wiki_size_bytes: number;
    db_size_bytes: number;
}

export type DoctorStatus = 'ok' | 'fixed' | 'warn';

export interface DoctorCheck {
    name: string;
    status: DoctorStatus;
    details: string;
    group: string; // 'core' | 'agent' | ...
}

export interface DoctorResult {
    project_dir: string;
    checks: DoctorCheck[];
    summary: string;
}

export interface GlobalDoctorCheck {
    project_dir: string;
    exists: boolean;
    initialized: boolean;
    agents: string[] | null;
    repo_count: number;
    checks: DoctorCheck[];
    healthy: boolean;
    issues_count: number;
}

export interface GlobalDoctorResult {
    projects: GlobalDoctorCheck[];
    summary: {
        total_projects: number;
        existing: number;
        deleted: number;
        healthy: number;
        with_issues: number;
        checks_total: number;
        checks_failed: number;
    };
}

export interface CliResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    rawOutput?: string;
}
