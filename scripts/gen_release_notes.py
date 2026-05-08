#!/usr/bin/env python3
"""生成 CHANGELOG 条目供人工审核。

用法：
    python gen_release_notes.py           # 自动递增版本号
    python gen_release_notes.py 0.2.0     # 指定版本号

版本递增规则：
    patch < 9 → patch + 1    （0.1.1 → 0.1.2）
    patch = 9 → minor + 1    （0.1.9 → 0.2.0）

流程：
    1. 运行本脚本 → 生成 CHANGELOG 条目 + .version 文件
    2. 人工审核 CHANGELOG.md
    3. 运行 python release.py 发布
"""

import json
import os
import subprocess
import sys
from datetime import date


def run(cmd, check=True):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"错误: {cmd}\n{result.stderr.strip()}")
        sys.exit(1)
    return result.stdout.strip()


def next_version(current):
    """计算下一个版本号：patch < 9 则 patch+1，否则 minor+1, patch=0。"""
    parts = current.split(".")
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2].split("-")[0])
    if patch < 9:
        patch += 1
    else:
        minor += 1
        patch = 0
    return f"{major}.{minor}.{patch}"


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    version_file = os.path.join(root, ".version")

    # 检查是否已有待发布的 .version
    if os.path.exists(version_file):
        pending = open(version_file, "r").read().strip()
        print(f"已有待发布版本: {pending}")
        print(f"请先运行 python release.py 发布，或手动删除 .version 后重试")
        sys.exit(1)

    # 确定版本号
    if len(sys.argv) >= 2:
        version = sys.argv[1].lstrip("v")
    else:
        with open(os.path.join(root, "package.json"), "r", encoding="utf-8") as f:
            current = json.load(f)["version"]
        version = next_version(current)
        print(f"当前版本: {current} → 下一版本: {version}")

    # 获取上一个 tag
    tags = run("git tag --sort=-version:refname", check=False)
    prev_tag = ""
    for t in tags.splitlines():
        if t != f"v{version}":
            prev_tag = t
            break

    # 获取 commit 日志
    log_range = f"{prev_tag}..HEAD" if prev_tag else "HEAD"
    log = run(f"git log {log_range} --pretty=format:%s --no-merges", check=False)

    if not log:
        print(f"从 {prev_tag or '初始提交'} 到 HEAD 无新 commit")
        print(f"如需强制生成，请先提交代码")
        sys.exit(0)

    # 分类
    features, fixes, others = [], [], []
    for line in log.splitlines():
        line = line.strip()
        if not line or line.startswith("chore: bump version"):
            continue
        low = line.lower()
        if low.startswith("feat") or low.startswith("add"):
            features.append(f"- {line}")
        elif low.startswith("fix") or low.startswith("bug"):
            fixes.append(f"- {line}")
        else:
            others.append(f"- {line}")

    total = len(features) + len(fixes) + len(others)
    if total == 0:
        print("过滤后无有效 commit")
        sys.exit(0)

    today = date.today().isoformat()
    sections = []
    if features:
        sections.append("### Features\n\n" + "\n".join(features))
    if fixes:
        sections.append("### Bug Fixes\n\n" + "\n".join(fixes))
    if others:
        sections.append("### Other Changes\n\n" + "\n".join(others))

    new_entry = f"## {version} ({today})\n\n" + "\n\n".join(sections) + "\n"

    # 更新 CHANGELOG.md
    changelog_path = os.path.join(root, "CHANGELOG.md")
    if os.path.exists(changelog_path):
        with open(changelog_path, "r", encoding="utf-8") as f:
            content = f.read()
    else:
        content = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n"

    marker = "\n\n"
    idx = content.find(marker, len("# Changelog"))
    if idx == -1:
        content = content.rstrip() + "\n\n" + new_entry
    else:
        content = content[:idx + len(marker)] + new_entry + "\n" + content[idx + len(marker):]

    with open(changelog_path, "w", encoding="utf-8") as f:
        f.write(content)

    # 写入 .version 中间文件
    with open(version_file, "w", encoding="utf-8") as f:
        f.write(version)

    print(f"\n已生成 {version} 的 CHANGELOG ({len(features)} feat, {len(fixes)} fix, {len(others)} other)")
    print(f"请审核 CHANGELOG.md，确认后运行：")
    print(f"  python release.py")


if __name__ == "__main__":
    main()
