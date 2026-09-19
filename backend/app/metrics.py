"""
Step 4 of the pipeline: numbers for one file.

  loc        – total / code / comment / blank line counts
  complexity – cyclomatic complexity: roughly "how many independent paths through
               the code". 1 for straight-line code, +1 for every if / loop / and / or ...
               Python: exact, via the `radon` library (it walks the AST).
               Others : approximate, by counting decision keywords.
  bloated    – True when a file is big or tangled enough to deserve a red border.
"""
import re
from dataclasses import dataclass

from radon.complexity import cc_visit

BLOATED_LOC = 500          # code lines
BLOATED_COMPLEXITY = 50    # summed over the whole file


@dataclass
class Loc:
    total: int
    code: int
    comment: int
    blank: int


# ---------------------------------------------------------------- line counting
def _count_python(lines: list[str]) -> Loc:
    code = comment = blank = 0
    in_doc = False           # inside a ''' or """ block
    for raw in lines:
        s = raw.strip()
        if in_doc:
            comment += 1
            if '"""' in s or "'''" in s:
                in_doc = False
            continue
        if not s:
            blank += 1
        elif s.startswith("#"):
            comment += 1
        elif s.startswith(('"""', "'''")):
            comment += 1
            # one-line docstring closes on the same line; otherwise we're inside one
            quote = s[:3]
            if s.count(quote) < 2:
                in_doc = True
        else:
            code += 1
    return Loc(len(lines), code, comment, blank)


def _count_c_style(lines: list[str]) -> Loc:
    """Works for JS, TS, C, C++: // line comments and /* */ block comments."""
    code = comment = blank = 0
    in_block = False
    for raw in lines:
        s = raw.strip()
        if in_block:
            comment += 1
            if "*/" in s:
                in_block = False
            continue
        if not s:
            blank += 1
        elif s.startswith("//"):
            comment += 1
        elif s.startswith("/*"):
            comment += 1
            if "*/" not in s:
                in_block = True
        else:
            code += 1
    return Loc(len(lines), code, comment, blank)


# ---------------------------------------------------------------- complexity
# Each match is one extra path through the code.
_DECISION = re.compile(r"\b(if|else if|for|while|case|catch)\b|&&|\|\||\?")
_C_COMMENT = re.compile(r"//[^\n]*|/\*.*?\*/", re.DOTALL)
_STRING = re.compile(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`", re.DOTALL)


def _complexity_python(text: str) -> int:
    try:
        blocks = cc_visit(text)   # one entry per function / method / class
    except Exception:
        return 1
    return max(1, sum(b.complexity for b in blocks)) if blocks else 1


def _complexity_keywords(text: str) -> int:
    text = _C_COMMENT.sub("", text)
    text = _STRING.sub('""', text)   # don't count an "if" inside a string
    return 1 + len(_DECISION.findall(text))


# ---------------------------------------------------------------- public API
def compute(language: str, text: str) -> tuple[Loc, int, bool]:
    lines = text.splitlines()
    if language == "python":
        loc = _count_python(lines)
        complexity = _complexity_python(text)
    else:
        loc = _count_c_style(lines)
        complexity = _complexity_keywords(text)
    bloated = loc.code > BLOATED_LOC or complexity > BLOATED_COMPLEXITY
    return loc, complexity, bloated
