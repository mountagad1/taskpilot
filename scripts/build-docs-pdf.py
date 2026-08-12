#!/usr/bin/env python3
"""Render the TaskPilot architecture docs into a single technical PDF.

The PDF is generated, never hand-edited — docs/architecture/*.md is the source
of truth, so the two cannot drift.

    pip install reportlab
    python3 scripts/build-docs-pdf.py \\
        docs/architecture \\
        docs/guides/TaskPilot-Technical-UpdatedDocumentation.pdf \\
        2.0

Bump the version argument when the architecture changes materially.
"""

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle,
)
from reportlab.platypus.flowables import CondPageBreak, HRFlowable

INDIGO = colors.HexColor("#6d76f5")
CYAN = colors.HexColor("#4bc6e8")
INK = colors.HexColor("#12121a")
BODY = colors.HexColor("#2e2e3a")
MUTED = colors.HexColor("#6b6b7b")
RULE = colors.HexColor("#e2e2ea")
CODEBG = colors.HexColor("#f6f6fa")

DOCS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
VERSION = sys.argv[3] if len(sys.argv) > 3 else "1.0"

ss = getSampleStyleSheet()

# ── Monospace face ──
# Courier's built-in metrics have no box-drawing glyphs, so the ASCII diagrams
# render as solid black squares. Prefer a real TTF that covers U+2500..257F and
# fall back to Courier with a transliteration so the build still works
# anywhere.
MONO = "Courier"
BOXED = False
for _p in ("/System/Library/Fonts/SFNSMono.ttf",
           "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
           "/Library/Fonts/DejaVuSansMono.ttf"):
    if Path(_p).exists():
        try:
            pdfmetrics.registerFont(TTFont("DocMono", _p))
            MONO, BOXED = "DocMono", True
            break
        except Exception:
            pass

BOX_ASCII = {
    0x2500: "-", 0x2501: "-", 0x2502: "|", 0x2503: "|", 0x250c: "+",
    0x250f: "+", 0x2510: "+", 0x2513: "+", 0x2514: "+", 0x2517: "+",
    0x2518: "+", 0x251b: "+", 0x251c: "+", 0x2524: "+", 0x252c: "+",
    0x2534: "+", 0x253c: "+", 0x2550: "=", 0x2551: "|", 0x2554: "+",
    0x2557: "+", 0x255a: "+", 0x255d: "+", 0x2560: "+", 0x2563: "+",
    0x2566: "+", 0x2569: "+", 0x256c: "+", 0x25b6: ">", 0x25c0: "<",
    0x25bc: "v", 0x25b2: "^", 0x2192: "->", 0x25aa: "*", 0x2022: "*",
}


def mono_safe(t):
    return t if BOXED else t.translate(BOX_ASCII)



def S(name, **kw):
    kw.setdefault("parent", ss["Normal"])
    return ParagraphStyle(name, **kw)


BODY_S = S("body", fontName="Helvetica", fontSize=9.4, leading=13.0,
           textColor=BODY, spaceAfter=5.5)
H1 = S("h1", fontName="Helvetica-Bold", fontSize=20, leading=25,
       textColor=INK, spaceBefore=0, spaceAfter=4)
H2 = S("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16,
       textColor=INK, spaceBefore=11, spaceAfter=5)
H3 = S("h3", fontName="Helvetica-Bold", fontSize=10.2, leading=13,
       textColor=INK, spaceBefore=8, spaceAfter=3)
BULLET = S("bullet", parent=BODY_S, leftIndent=12, bulletIndent=2, spaceAfter=3)
QUOTE = S("quote", parent=BODY_S, leftIndent=10, textColor=MUTED,
          fontName="Helvetica-Oblique", spaceBefore=4, spaceAfter=8)
CODE = S("code", fontName=MONO, fontSize=7.2, leading=8.9,
         textColor=INK, backColor=CODEBG, borderPadding=6,
         spaceBefore=4, spaceAfter=9)
TH = S("th", fontName="Helvetica-Bold", fontSize=8.3, leading=11,
       textColor=colors.white)
TD = S("td", fontName="Helvetica", fontSize=8.3, leading=11.5, textColor=BODY)

# Cover
COVER_T = S("ct", fontName="Helvetica-Bold", fontSize=32, leading=38,
            textColor=INK, alignment=TA_LEFT)
COVER_SUB = S("cs", fontName="Helvetica", fontSize=13, leading=19,
              textColor=MUTED, alignment=TA_LEFT)
COVER_META = S("cm", fontName="Helvetica", fontSize=9, leading=15,
               textColor=MUTED, alignment=TA_LEFT)

INLINE = [
    (re.compile(r"`([^`]+)`"),
     r'<font face="%s" size="8.4" color="#3a3a52">\1</font>' % MONO),
    (re.compile(r"\*\*([^*]+)\*\*"), r"<b>\1</b>"),
    (re.compile(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])"), r"<i>\1</i>"),
    (re.compile(r"\[([^\]]+)\]\([^)]+\)"), r"\1"),
]


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(t):
    t = esc(t)
    for rx, rep in INLINE:
        t = rx.sub(rep, t)
    return t


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def make_table(rows, width):
    head, body = rows[0], rows[1:]
    data = [[Paragraph(inline(c), TH) for c in head]]
    for r in body:
        data.append([Paragraph(inline(c), TD) for c in r])
    n = len(head)
    # First column carries the identifier; give it more room.
    if n == 1:
        widths = [width]
    else:
        first = width * (0.34 if n <= 3 else 0.28)
        widths = [first] + [(width - first) / (n - 1)] * (n - 1)
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CODEBG]),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
    ]))
    return t


def render(md, width, first_heading_style=H1):
    """Markdown subset -> flowables. Handles the constructs our docs use."""
    out, lines, i = [], md.split("\n"), 0
    seen_h1 = False
    while i < len(lines):
        ln = lines[i]

        # fenced code / ascii diagrams
        if ln.lstrip().startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            if buf:
                out.append(Preformatted(mono_safe("\n".join(buf)), CODE))
            continue

        # table
        if ln.startswith("|") and i + 1 < len(lines) and re.match(
                r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            rows = [split_row(ln)]
            i += 2
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            out.append(Spacer(1, 3))
            out.append(make_table(rows, width))
            out.append(Spacer(1, 7))
            continue

        s = ln.strip()

        if not s:
            i += 1
            continue
        if s in ("---", "***", "___"):
            out.append(Spacer(1, 7))
            i += 1
            continue
        if s.startswith("#"):
            lvl = len(s) - len(s.lstrip("#"))
            txt = s.lstrip("#").strip()
            if lvl == 1:
                st = first_heading_style if not seen_h1 else H2
                seen_h1 = True
            else:
                st = H2 if lvl == 2 else H3
            out.append(Paragraph(inline(txt), st))
            i += 1
            continue
        if s.startswith(">"):
            out.append(Paragraph(inline(s.lstrip("> ").strip()), QUOTE))
            i += 1
            continue
        if re.match(r"^[-*]\s+", s):
            out.append(Paragraph(inline(re.sub(r"^[-*]\s+", "", s)),
                                 BULLET, bulletText="•"))
            i += 1
            continue
        if re.match(r"^\d+\.\s+", s):
            num = s.split(".", 1)[0]
            out.append(Paragraph(inline(re.sub(r"^\d+\.\s+", "", s)),
                                 BULLET, bulletText=f"{num}."))
            i += 1
            continue

        # paragraph: join wrapped lines
        buf = [s]
        i += 1
        while i < len(lines):
            nx = lines[i].strip()
            if (not nx or nx.startswith(("#", ">", "|", "```", "---"))
                    or re.match(r"^([-*]|\d+\.)\s+", nx)):
                break
            buf.append(nx)
            i += 1
        out.append(Paragraph(inline(" ".join(buf)), BODY_S))
    return out


class Doc(BaseDocTemplate):
    def __init__(self, path, **kw):
        super().__init__(path, **kw)
        fw = self.width
        fh = self.height
        self.addPageTemplates([
            PageTemplate(id="cover",
                         frames=[Frame(self.leftMargin, self.bottomMargin,
                                       fw, fh, id="c")],
                         onPage=self.cover_bg),
            PageTemplate(id="body",
                         frames=[Frame(self.leftMargin, self.bottomMargin,
                                       fw, fh, id="b")],
                         onPage=self.decorate),
        ])

    def cover_bg(self, c, d):
        c.saveState()
        # Brand gradient runs indigo -> cyan, left to right.
        c.linearGradient(0, A4[1] - 5 * mm, A4[0], A4[1] - 5 * mm,
                         (INDIGO, CYAN), extend=True)
        c.setFillColor(colors.white)
        c.rect(0, 0, A4[0], A4[1] - 10 * mm, stroke=0, fill=1)
        c.restoreState()

    def decorate(self, c, d):
        c.saveState()
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        y = A4[1] - 13 * mm
        c.line(self.leftMargin, y, A4[0] - self.rightMargin, y)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(MUTED)
        c.drawString(self.leftMargin, y + 3.2 * mm,
                     "TaskPilot — Technical Documentation")
        c.drawRightString(A4[0] - self.rightMargin, y + 3.2 * mm,
                          f"v{VERSION}")
        c.setFillColor(INDIGO)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(A4[0] / 2, 11 * mm, str(d.page - 1))
        c.restoreState()


ORDER = [
    "00_OVERVIEW.md", "01_PRODUCT_VISION.md", "02_ENGINEERING_PRINCIPLES.md",
    "03_SYSTEM_ARCHITECTURE.md", "04_DOMAIN_MODEL.md", "05_DATA_FLOW.md",
    "06_EXECUTION_PIPELINE.md", "07_EVENT_ARCHITECTURE.md",
    "08_SECURITY_MODEL.md", "09_DEPLOYMENT.md", "10_PERFORMANCE.md",
]

doc = Doc(str(OUT), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
          topMargin=20 * mm, bottomMargin=18 * mm,
          title="TaskPilot — Technical Documentation",
          author="TaskPilot", subject="Architecture reference")

W = doc.width
story = []

# ── Cover ──
story += [
    Spacer(1, 52 * mm),
    Paragraph("TaskPilot", COVER_T),
    Spacer(1, 3 * mm),
    Paragraph("Technical Documentation", COVER_SUB),
    Spacer(1, 7 * mm),
    Paragraph("The AI Agent for Your Browser — architecture reference for the "
              "web app, browser extension, AI runtime, marketplace and "
              "developer platform.", COVER_SUB),
    Spacer(1, 14 * mm),
]
meta = Table([
    ["Version", VERSION],
    ["Scope", "Architecture (00–10)"],
    ["Source", "docs/architecture/"],
    ["Status", "Current — supersedes TaskPilot-Technical-Documentation.pdf"],
], colWidths=[30 * mm, W - 30 * mm], hAlign="LEFT")
meta.setStyle(TableStyle([
    ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8.5),
    ("FONT", (1, 0), (1, -1), "Helvetica", 8.5),
    ("TEXTCOLOR", (0, 0), (0, -1), INK),
    ("TEXTCOLOR", (1, 0), (1, -1), MUTED),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
]))
story += [meta, NextPageTemplate("body"), PageBreak()]

# ── Contents ──
story.append(Paragraph("Contents", H1))
story.append(Spacer(1, 4))
toc = [["#", "Section", "Covers"]]
SUMMARY = {
    "00_OVERVIEW.md": "The system in one page",
    "01_PRODUCT_VISION.md": "What TaskPilot is for; the five products",
    "02_ENGINEERING_PRINCIPLES.md": "The rules the code follows",
    "03_SYSTEM_ARCHITECTURE.md": "Layers, service map, module ownership",
    "04_DOMAIN_MODEL.md": "Entities and relationships",
    "05_DATA_FLOW.md": "How a request becomes an action",
    "06_EXECUTION_PIPELINE.md": "Plan, step, execute, record",
    "07_EVENT_ARCHITECTURE.md": "Jobs, cron, notifications",
    "08_SECURITY_MODEL.md": "Trust boundaries, RLS, secrets, CORS",
    "09_DEPLOYMENT.md": "Hosts, environments, build-time constraints",
    "10_PERFORMANCE.md": "Caching, token budgeting, limits",
}
for fn in ORDER:
    num, title = fn.split("_", 1)
    toc.append([num, title.replace(".md", "").replace("_", " ").title(),
                SUMMARY[fn]])
story.append(make_table(toc, W))
story.append(PageBreak())

# ── Sections ──
for n, fn in enumerate(ORDER):
    p = DOCS / fn
    if not p.exists():
        raise SystemExit(f"missing: {p}")
    if n:
        # Sections flow continuously; a rule marks the boundary. Forcing a
        # page break per section left several pages almost empty, which reads
        # worse in a reference than a clear divider does.
        story.append(Spacer(1, 13))
        story.append(HRFlowable(width="100%", thickness=1.1, color=INDIGO,
                                spaceBefore=0, spaceAfter=11))
        story.append(CondPageBreak(58 * mm))
    story += render(p.read_text(encoding="utf-8"), W)

doc.build(story)
print(f"wrote {OUT}")
