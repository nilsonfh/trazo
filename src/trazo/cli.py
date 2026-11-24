"""The trazo command: installs the skill for coding agents and runs its tools.

  trazo install [claude] [copilot] [agents] [--project DIR] [--link]
  trazo uninstall [claude] [copilot] [agents] [--project DIR]
  trazo inline page.html > out.html          scripts/inline.py
  trazo shot ... | trazo check page.html     scripts/shot.sh, shot.sh --check
  trazo todrawio page.html TARGET out.drawio scripts/todrawio.sh
  trazo pdf [--steps] [--dark] page.html out.pdf   scripts/topdf.sh
  trazo theme DESIGN.md -o themes/x.css      scripts/theme_from_design.py
  trazo check-theme themes/x.css             scripts/check_theme.py
  trazo vendor DEST                          scripts/vendor.sh
  trazo test                                 scripts/test.sh
  trazo path | trazo version
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__, skill_dir

NAME = "html-diagrams-decks"
MARK = ".trazo-install"   # written into a copy made by trazo, so that only those are replaced or removed
AGENTS = {   # agent: (home folder, project folder)
    "claude": ("~/.claude/skills", ".claude/skills"),
    "copilot": ("~/.copilot/skills", ".github/skills"),
    "agents": ("~/.agents/skills", ".agents/skills"),
}
TOOLS = {   # command: (script, extra arguments)
    "inline": ("inline.py", []),
    "shot": ("shot.sh", []),
    "check": ("shot.sh", ["--check"]),
    "todrawio": ("todrawio.sh", []),
    "pdf": ("topdf.sh", []),
    "theme": ("theme_from_design.py", []),
    "check-theme": ("check_theme.py", []),
    "vendor": ("vendor.sh", []),
    "test": ("test.sh", []),
}


def targets(agents, project):
    if not agents:   # every agent whose home folder exists, else Claude Code
        agents = [a for a in ("claude", "copilot") if Path(AGENTS[a][0]).expanduser().parent.is_dir()] or ["claude"]
    out = []
    for a in agents:
        if a not in AGENTS:
            sys.exit(f"trazo: unknown agent {a} ({', '.join(AGENTS)})")
        base = Path(project, AGENTS[a][1]) if project else Path(AGENTS[a][0]).expanduser()
        out.append((a, base / NAME))
    return out


def ours(dest):
    return dest.is_symlink() or (dest / MARK).is_file()


def install(args):
    src, rc = skill_dir(), 0
    for agent, dest in targets(args.agents, args.project):
        if dest.exists() or dest.is_symlink():
            if not ours(dest):
                print(f"trazo: {dest} exists and was not installed by trazo; move it away first", file=sys.stderr)
                rc = 1
                continue
            dest.unlink() if dest.is_symlink() else shutil.rmtree(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if args.link:
            dest.symlink_to(src, target_is_directory=True)
        else:
            shutil.copytree(src, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            (dest / MARK).write_text(f"trazo {__version__}\n")
        print(f"{'linked' if args.link else 'copied'} {NAME} {__version__} for {agent}: {dest}")
    if rc == 0:
        print("Start a new session of the agent to load it.")
    return rc


def uninstall(args):
    rc = 0
    for agent, dest in targets(args.agents, args.project):
        if not (dest.exists() or dest.is_symlink()):
            continue
        if not ours(dest):
            print(f"trazo: {dest} was not installed by trazo; left alone", file=sys.stderr)
            rc = 1
            continue
        dest.unlink() if dest.is_symlink() else shutil.rmtree(dest)
        print(f"removed {NAME} for {agent}: {dest}")
    return rc


def tool(cmd, rest):
    script, extra = TOOLS[cmd]
    path = skill_dir() / "scripts" / script
    if script.endswith(".py"):
        argv = [sys.executable, str(path)]
    else:
        bash = shutil.which("bash")
        if not bash:
            sys.exit(f"trazo {cmd}: needs bash (on Windows, use WSL or Git Bash)")
        argv = [bash, str(path)]
    return subprocess.call(argv + extra + rest)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] in TOOLS:
        return tool(argv[0], argv[1:])
    p = argparse.ArgumentParser(prog="trazo", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd")
    for name, fn, text in (("install", install, "install the skill for coding agents"),
                           ("uninstall", uninstall, "remove a skill installed by trazo")):
        s = sub.add_parser(name, help=text)
        s.add_argument("agents", nargs="*", metavar="agent", help="claude, copilot, agents (default: those installed here)")
        s.add_argument("--project", metavar="DIR", help="into a repository: DIR/.claude/skills, DIR/.github/skills or DIR/.agents/skills")
        if name == "install":
            s.add_argument("--link", action="store_true", help="link to the installed package instead of copying (a uv tool upgrade then updates it)")
        s.set_defaults(fn=fn)
    sub.add_parser("path", help="print the skill's folder").set_defaults(fn=lambda a: print(skill_dir()) or 0)
    sub.add_parser("version", help="print the version").set_defaults(fn=lambda a: print(__version__) or 0)
    for name in TOOLS:
        sub.add_parser(name, help=f"run scripts/{TOOLS[name][0]}" + (" --check" if TOOLS[name][1] else ""), add_help=False)
    a = p.parse_args(argv)
    if not a.cmd:
        p.print_help()
        return 0
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
