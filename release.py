#!/usr/bin/env python3
"""自动同步版本号并创建 Git tag 发布。

用法：
    python release.py 0.1.0
    python release.py 1.0.0-beta.1
"""

import json
import re
import subprocess
import sys
import os


def run(cmd, check=True):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"错误: {cmd}\n{result.stderr.strip()}")
        sys.exit(1)
    return result.stdout.strip()


def update_package_version(filepath, version):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = version
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  已更新 {filepath}")


def main():
    if len(sys.argv) != 2:
        print(f"用法: python {sys.argv[0]} <version>")
        print(f"示例: python {sys.argv[0]} 0.1.0")
        print(f"      python {sys.argv[0]} 1.0.0-beta.1")
        sys.exit(1)

    version = sys.argv[1].lstrip("v")
    tag = f"v{version}"

    # 检查工作区是否干净
    status = run("git status --porcelain", check=False)
    if status:
        print("存在未提交的更改，请先提交或暂存：")
        print(status)
        sys.exit(1)

    # 检查 tag 是否已存在
    tags = run("git tag -l", check=False)
    if tag in tags.splitlines():
        print(f"标签 {tag} 已存在，请先删除：git tag -d {tag} && git push origin --delete {tag}")
        sys.exit(1)

    print(f"准备发布 {tag} ...")

    # 更新版本号
    root = os.path.dirname(os.path.abspath(__file__))
    update_package_version(os.path.join(root, "package.json"), version)

    # 提交版本号变更
    run('git add package.json')
    run(f'git commit -m "chore: bump version to {version}"')

    # 创建 tag
    run(f'git tag {tag}')

    # 推送
    print(f"推送代码和标签 {tag} ...")
    run("git push origin master")
    run(f"git push origin {tag}")

    print(f"\n发布完成！{tag}")
    print(f"查看: https://github.com/cicbyte/reference-vscode-plugin/releases/tag/{tag}")


if __name__ == "__main__":
    main()
