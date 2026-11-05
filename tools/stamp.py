"""Stamps the site with content hashes so returning browsers pick up new files.

Rewrites the ?v= tag on every local CSS, JS and PDF link in the HTML pages, then
writes one version for the whole site to version.json and each page's
site-version meta tag (update.js compares the two). Output only changes when the
site's content does. Runs from the pre-commit hook in tools/hooks.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = sorted(ROOT.glob("*.html"))
LINK = re.compile(r'(href|src)="([^":?]+\.(?:css|js|pdf))(?:\?v=[^"]*)?"')
META = re.compile(r'(<meta name="site-version" content=")[^"]*(">)')


def normalized(data):
    # Git may swap line endings on checkout; that shouldn't count as a new version
    return data.replace(b"\r\n", b"\n")


def short_hash(data):
    return hashlib.sha256(normalized(data)).hexdigest()[:10]


def stamp_link(match):
    attr, path = match.group(1), match.group(2)
    return f'{attr}="{path}?v={short_hash((ROOT / path).read_bytes())}"'


def read_text(path):
    # newline="" keeps the file's existing line endings
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write_if_changed(path, text):
    if not path.exists() or read_text(path) != text:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)


def main():
    pages = {}
    for page in PAGES:
        text = read_text(page)
        if not META.search(text):
            sys.exit(f'{page.name}: missing <meta name="site-version">')
        pages[page] = LINK.sub(stamp_link, text)

    # The version can't cover its own value, so hash the pages with it blanked
    digest = hashlib.sha256()
    for text in pages.values():
        digest.update(normalized(META.sub(r"\1\2", text).encode("utf-8")))
    files = [*ROOT.glob("*.css"), *ROOT.glob("*.js"),
             *(p for p in (ROOT / "assets").rglob("*") if p.is_file())]
    for path in sorted(files):
        digest.update(path.relative_to(ROOT).as_posix().encode("utf-8"))
        digest.update(normalized(path.read_bytes()))
    version = digest.hexdigest()[:10]

    for page, text in pages.items():
        write_if_changed(page, META.sub(rf"\g<1>{version}\g<2>", text))
    write_if_changed(ROOT / "version.json", f'{{"version":"{version}"}}\n')
    print(f"site version {version}")


if __name__ == "__main__":
    main()
