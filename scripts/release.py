#!/usr/bin/env python3
"""读取 .version 文件并执行发布。

前置步骤：
    python gen_release_notes.py          # 生成 CHANGELOG + .version

用法：
    python release.py                    # 读取 .version 发布
"""

import json
import os
import subprocess
import sys


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
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    version_file = os.path.join(root, ".version")

    # 读取 .version
    if not os.path.exists(version_file):
        print(".version 文件不存在。请先运行: python gen_release_notes.py")
        sys.exit(1)

    version = open(version_file, "r").read().strip()
    if not version:
        print(".version 文件为空。请先运行: python gen_release_notes.py")
        sys.exit(1)

    tag = f"v{version}"

    # 检查 CHANGELOG
    changelog_path = os.path.join(root, "CHANGELOG.md")
    if os.path.exists(changelog_path):
        with open(changelog_path, "r", encoding="utf-8") as f:
            if f"## {version}" not in f.read():
                print(f"CHANGELOG.md 中未找到 {version} 条目。")
                print(f"请先运行: python gen_release_notes.py")
                sys.exit(1)
    else:
        print("CHANGELOG.md 不存在。请先运行: python gen_release_notes.py")
        sys.exit(1)

    # 检查工作区是否干净（除 .version 外）
    status = run("git status --porcelain", check=False)
    dirty = [l for l in status.splitlines() if not l.startswith("?? .version")]
    if dirty:
        print("存在未提交的更改，请先提交或暂存：")
        print("\n".join(dirty))
        sys.exit(1)

    # 检查 tag 是否已存在
    tags = run("git tag -l", check=False)
    if tag in tags.splitlines():
        print(f"标签 {tag} 已存在，请先删除：git tag -d {tag} && git push origin --delete {tag}")
        sys.exit(1)

    print(f"准备发布 {tag} ...")

    # 更新版本号
    update_package_version(os.path.join(root, "package.json"), version)

    # 提交版本号变更
    run('git add package.json CHANGELOG.md')
    run(f'git commit -m "chore: release {tag}"')

    # 创建 tag
    run(f'git tag {tag}')

    # 推送
    print(f"推送代码和标签 {tag} ...")
    run("git push origin master")
    run(f"git push origin {tag}")

    # 清理 .version
    os.remove(version_file)
    print(f"  已清理 .version")

    print(f"\n发布完成！{tag}")
    print(f"  GitHub:  https://github.com/cicbyte/reference-vscode-plugin/releases/tag/{tag}")
    print(f"  Market:  https://marketplace.visualstudio.com/items?itemName=cicbyte.reference-vscode-plugin")


if __name__ == "__main__":
    main()
