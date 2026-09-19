"""
Step 2 of the pipeline: pull the raw import statements out of one file.

We do NOT run any code. Python is parsed with the built-in `ast` module (a real
parser, so it can't be fooled by strings that look like imports). JavaScript and
C use regular expressions, which is good enough for import lines.

Output is a list of ImportRef. The resolver (next step) turns each one into a
real file path inside the repo, or marks it external.
"""
import ast
import re
from dataclasses import dataclass, field


@dataclass
class ImportRef:
    target: str                 # "os.path", "./utils", "foo.h"
    level: int = 0              # Python only: number of leading dots in `from ..x import y`
    names: list[str] = field(default_factory=list)  # Python only: the y in `from x import y`
    system: bool = False        # C only: True for #include <...>


# ---------------------------------------------------------------- Python
def _parse_python(text: str) -> list[ImportRef]:
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []   # Python 2 file or broken file – nothing we can do

    refs: list[ImportRef] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            # `import a.b, c`  ->  two refs
            for alias in node.names:
                refs.append(ImportRef(target=alias.name))
        elif isinstance(node, ast.ImportFrom):
            # `from ..pkg import x, y`  ->  target="pkg", level=2, names=[x, y]
            refs.append(ImportRef(
                target=node.module or "",
                level=node.level,
                names=[a.name for a in node.names],
            ))
    return refs


# ---------------------------------------------------------------- JS / TS
# One regex per import style. Each has exactly one capture group: the module string.
_JS_PATTERNS = [
    re.compile(r"""\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]"""),  # import x from 'y' / import 'y'
    re.compile(r"""\bexport\s+(?:[\w*{}\s,$]+?\s+)?from\s+['"]([^'"]+)['"]"""),   # export { x } from 'y'
    re.compile(r"""\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)"""),                    # require('y')
    re.compile(r"""\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"""),                     # import('y')
]
_JS_COMMENT = re.compile(r"//[^\n]*|/\*.*?\*/", re.DOTALL)


def _parse_js(text: str) -> list[ImportRef]:
    text = _JS_COMMENT.sub("", text)   # so a commented-out import doesn't count
    seen: set[str] = set()
    refs: list[ImportRef] = []
    for pattern in _JS_PATTERNS:
        for match in pattern.finditer(text):
            target = match.group(1)
            if target not in seen:
                seen.add(target)
                refs.append(ImportRef(target=target))
    return refs


# ---------------------------------------------------------------- C / C++
_C_INCLUDE = re.compile(r'^\s*#\s*include\s*([<"])([^>"]+)[>"]', re.MULTILINE)


def _parse_c(text: str) -> list[ImportRef]:
    refs = []
    for match in _C_INCLUDE.finditer(text):
        bracket, target = match.groups()
        refs.append(ImportRef(target=target, system=(bracket == "<")))
    return refs


# ---------------------------------------------------------------- dispatcher
_PARSERS = {
    "python": _parse_python,
    "javascript": _parse_js,
    "typescript": _parse_js,
    "c": _parse_c,
    "cpp": _parse_c,
}


def extract_imports(language: str, text: str) -> list[ImportRef]:
    parser = _PARSERS.get(language)
    return parser(text) if parser else []
