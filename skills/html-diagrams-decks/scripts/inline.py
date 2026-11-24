#!/usr/bin/env python3
"""Inline the library, the icon sprite, the deck engine and a theme into a page, so it publishes as one file.

    inline.py page.html > out.html
    inline.py --lib DIR --themes DIR page.html > out.html

Every <script src=".../NAME"></script> whose NAME is a library file (edgediagram.js, edgesketch.js, edgesequence.js,
edgetimeline.js, edgedeck.js, icons.js) is replaced by that file's contents, whatever other attributes the tag has, and a
<link rel="stylesheet" href=".../themes/NAME.css"> by a <style> holding the theme (its @import of Google
Fonts stays first in the block, as CSS requires). The files are looked up in --lib and --themes if given,
else in ../lib and ../themes next to this script (the skill's layout), else in this script's own folder
and ./themes beside it (the layout of a copy made by scripts/vendor.sh).

A tag that names a library file or a theme that cannot be found is an error, and so is a library file
or a theme included twice: nothing is left behind silently. Other local scripts and stylesheets are
reported on stderr, since a published page cannot load them. GSAP stays a CDN <script>.
"""
import argparse, os, re, sys

LIB_FILES = ("edgediagram.js", "edgesketch.js", "edgesequence.js", "edgetimeline.js", "edgedeck.js", "icons.js")
HERE = os.path.dirname(os.path.abspath(__file__))


def find_dir(given, candidates, probe):
    for d in ([given] if given else candidates):
        if d and os.path.exists(os.path.join(d, probe)):
            return d
    return given or candidates[0]


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("page")
    ap.add_argument("--lib", help="folder that holds the library files")
    ap.add_argument("--themes", help="folder that holds the themes")
    a = ap.parse_args(argv)
    lib = find_dir(a.lib, [os.path.join(HERE, "..", "lib"), HERE], "edgediagram.js")
    themes = find_dir(a.themes, [os.path.join(HERE, "..", "themes"), os.path.join(HERE, "themes")], "engineering.css")
    html = open(a.page, encoding="utf-8").read()
    errors, used = [], {}

    def script(m):
        src = m.group(1)
        name = src.rsplit("/", 1)[-1].split("?")[0]
        if name not in LIB_FILES:
            if not re.match(r"(https?:)?//", src):
                print("inline.py: %s: local script %s is left as it is; a published page cannot load it" % (a.page, src), file=sys.stderr)
            return m.group(0)
        used[name] = used.get(name, 0) + 1
        if used[name] > 1:
            errors.append("%s is included twice" % name)
            return ""
        path = os.path.join(lib, name)
        if not os.path.exists(path):
            errors.append("%s not found in %s" % (name, lib))
            return m.group(0)
        code = open(path, encoding="utf-8").read().replace("</script", "<\\/script")
        return "<script>\n" + code + "\n</script>"

    html = re.sub(r'<script\b[^>]*?\bsrc="([^"]+)"[^>]*>\s*</script>', script, html)

    def link(m):
        tag, href = m.group(0), m.group(1)
        if not re.search(r'\brel="stylesheet"', tag):
            return tag
        t = re.search(r"(?:^|/)themes/([a-z0-9-]+)\.css$", href)
        if not t:
            if not re.match(r"(https?:)?//", href):
                print("inline.py: %s: local stylesheet %s is left as it is; a published page cannot load it" % (a.page, href), file=sys.stderr)
            return tag
        used["theme"] = used.get("theme", 0) + 1
        if used["theme"] > 1:
            errors.append("more than one theme: one theme per page")
            return ""
        path = os.path.join(themes, t.group(1) + ".css")
        if not os.path.exists(path):
            errors.append("theme %s not found in %s" % (t.group(1), themes))
            return tag
        return "<style>\n" + open(path, encoding="utf-8").read().replace("</style", "<\\/style") + "</style>"

    html = re.sub(r'<link\b[^>]*?\bhref="([^"]+)"[^>]*>', link, html)
    if errors:
        for e in errors:
            print("inline.py: %s: %s" % (a.page, e), file=sys.stderr)
        return 1
    sys.stdout.write(html)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
