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

export interface CliResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    rawOutput?: string;
}
