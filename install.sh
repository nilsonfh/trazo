#!/bin/sh
# Install the skill for Claude Code, GitHub Copilot, or any agent that reads the Agent Skills folders.
#
#   ./install.sh                         # for every agent whose home folder exists (~/.claude, ~/.copilot), else Claude Code
#   ./install.sh claude copilot agents   # for the agents named
#   ./install.sh --copy copilot          # a copy instead of a link
#   ./install.sh --project DIR copilot   # into a repository: DIR/.github/skills, DIR/.claude/skills or DIR/.agents/skills
#
# Agents and their folders:
#   claude   ~/.claude/skills    (project: .claude/skills)   Claude Code
#   copilot  ~/.copilot/skills   (project: .github/skills)   GitHub Copilot: CLI, VS Code, cloud agent
#   agents   ~/.agents/skills    (project: .agents/skills)   Copilot CLI, Codex and other agents of the open standard
#
# A link keeps the installed skill in step with this clone: git pull updates it. An existing folder of
# the same name is left alone unless it is a link made by this script.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
src=$here/skills/html-diagrams-decks
name=html-diagrams-decks
copy=0 project=
while [ $# -gt 0 ]; do
  case $1 in
    --copy) copy=1; shift ;;
    --project) project=$(cd "$2" && pwd); shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    -*) echo "install.sh: unknown option $1" >&2; exit 64 ;;
    *) break ;;
  esac
done
if [ $# -eq 0 ]; then
  [ -d "$HOME/.claude" ] && set -- "$@" claude
  [ -d "$HOME/.copilot" ] && set -- "$@" copilot
  [ $# -gt 0 ] || set -- claude
fi
rc=0
for agent in "$@"; do
  case $agent in
    claude)  base=${project:+$project/.claude/skills}; base=${base:-$HOME/.claude/skills} ;;
    copilot) base=${project:+$project/.github/skills}; base=${base:-$HOME/.copilot/skills} ;;
    agents)  base=${project:+$project/.agents/skills}; base=${base:-$HOME/.agents/skills} ;;
    *) echo "install.sh: unknown agent $agent (claude, copilot, agents)" >&2; rc=64; continue ;;
  esac
  dest=$base/$name
  mkdir -p "$base"
  if [ -L "$dest" ]; then
    rm "$dest"
  elif [ -e "$dest" ]; then
    echo "install.sh: $dest exists and is not a link; move it away first" >&2; rc=1; continue
  fi
  if [ $copy = 1 ]; then cp -R "$src" "$dest"; how=copied; else ln -s "$src" "$dest"; how=linked; fi
  echo "$how $name for $agent: $dest"
done
exit $rc
