"""trazo: the html-diagrams-decks agent skill and its tools, installable with uv or pip."""
from pathlib import Path

__version__ = "1.6.0"


def skill_dir() -> Path:
    """The skill's folder: inside the installed package, or in the clone this file runs from."""
    here = Path(__file__).resolve().parent
    for p in (here / "skill", here.parent.parent / "skills" / "html-diagrams-decks"):
        if (p / "SKILL.md").is_file():
            return p
    raise FileNotFoundError("trazo: the skill's files are missing from this install")
