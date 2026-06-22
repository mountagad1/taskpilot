#!/usr/bin/env python3
"""
TaskPilot Technical Documentation Generator
Produces a comprehensive multi-chapter PDF guide.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ─── Colors ───────────────────────────────────────────────
INDIGO     = HexColor('#6366f1')
INDIGO_DARK = HexColor('#4f46e5')
CYAN       = HexColor('#22d3ee')
BG_DARK    = HexColor('#070711')
BG_CARD    = HexColor('#0d0d1a')
FG         = HexColor('#f0f0ff')
FG2        = HexColor('#9898bb')
FG3        = HexColor('#5a5a88')
GREEN      = HexColor('#10b981')
AMBER      = HexColor('#f59e0b')
RED        = HexColor('#ef4444')
BORDER     = HexColor('#1a1a35')
WHITE      = white
BLACK      = black

# ─── Styles ───────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

STYLES = {
    'h1': S('H1', fontSize=28, fontName='Helvetica-Bold', textColor=FG,
            spaceAfter=6, spaceBefore=20, leading=34),
    'h2': S('H2', fontSize=18, fontName='Helvetica-Bold', textColor=FG,
            spaceAfter=4, spaceBefore=16, leading=24),
    'h3': S('H3', fontSize=13, fontName='Helvetica-Bold', textColor=INDIGO,
            spaceAfter=3, spaceBefore=12, leading=18),
    'h4': S('H4', fontSize=11, fontName='Helvetica-Bold', textColor=FG,
            spaceAfter=2, spaceBefore=8, leading=15),
    'body': S('Body', fontSize=10, fontName='Helvetica', textColor=FG2,
              spaceAfter=6, leading=16, alignment=TA_JUSTIFY),
    'body_left': S('BodyLeft', fontSize=10, fontName='Helvetica', textColor=FG2,
                   spaceAfter=6, leading=16),
    'code': S('Code', fontSize=8.5, fontName='Courier', textColor=CYAN,
              backColor=BG_CARD, borderPadding=(6,8,6,8), spaceAfter=8,
              leading=13, leftIndent=12),
    'bullet': S('Bullet', fontSize=10, fontName='Helvetica', textColor=FG2,
                spaceAfter=3, leading=15, leftIndent=16, bulletIndent=4),
    'caption': S('Caption', fontSize=8, fontName='Helvetica', textColor=FG3,
                 spaceAfter=4, leading=12, alignment=TA_CENTER),
    'label': S('Label', fontSize=9, fontName='Helvetica-Bold', textColor=INDIGO,
               spaceAfter=2, leading=12, spaceBefore=4),
    'big': S('Big', fontSize=13, fontName='Helvetica', textColor=FG2,
             spaceAfter=8, leading=20),
    'chapter_intro': S('ChapterIntro', fontSize=12, fontName='Helvetica',
                       textColor=FG2, spaceAfter=12, leading=20,
                       borderPadding=(12,16,12,16), borderColor=BORDER,
                       borderWidth=1, backColor=BG_CARD),
}

# ─── Custom Flowables ─────────────────────────────────────
class GradientRect(Flowable):
    def __init__(self, w, h, text='', sub=''):
        Flowable.__init__(self)
        self.w, self.h, self.text, self.sub = w, h, text, sub

    def draw(self):
        c = self.canv
        c.setFillColor(BG_DARK)
        c.rect(0, 0, self.w, self.h, fill=1, stroke=0)
        c.setFillColor(HexColor('#6366f120'))
        c.rect(0, 0, self.w * 0.6, self.h, fill=1, stroke=0)
        if self.text:
            c.setFillColor(FG)
            c.setFont('Helvetica-Bold', 22)
            c.drawString(20, self.h - 36, self.text)
        if self.sub:
            c.setFillColor(FG2)
            c.setFont('Helvetica', 11)
            c.drawString(20, self.h - 56, self.sub)

class ColorBox(Flowable):
    def __init__(self, w, h, color, radius=4):
        Flowable.__init__(self)
        self.w, self.h, self.color, self.r = w, h, color, radius

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 0, self.w, self.h, self.r, fill=1, stroke=0)

class ChapterDivider(Flowable):
    def __init__(self, num, title, desc='', w=None):
        Flowable.__init__(self)
        self.num, self.title, self.desc = num, title, desc
        self.width = w or (A4[0] - 4*cm)

    def wrap(self, avW, avH):
        self.width = avW
        return avW, 72

    def draw(self):
        c = self.canv
        w = self.width
        c.setFillColor(BG_CARD)
        c.roundRect(0, 0, w, 68, 8, fill=1, stroke=0)
        c.setFillColor(INDIGO)
        c.roundRect(0, 0, 4, 68, 4, fill=1, stroke=0)
        c.setFillColor(INDIGO)
        c.setFont('Helvetica-Bold', 9)
        c.drawString(16, 50, f'CHAPTER {self.num}')
        c.setFillColor(FG)
        c.setFont('Helvetica-Bold', 16)
        c.drawString(16, 28, self.title)
        if self.desc:
            c.setFillColor(FG2)
            c.setFont('Helvetica', 9)
            c.drawString(16, 12, self.desc)

def sep(): return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=12, spaceBefore=8)
def sp(n=8): return Spacer(1, n)
def P(text, style='body'): return Paragraph(text, STYLES[style])
def H(text, level=2): return Paragraph(text, STYLES[f'h{level}'])
def Code(text): return Paragraph(text.replace('\n','<br/>').replace(' ','&nbsp;'), STYLES['code'])
def Bullet(text): return Paragraph(f'• {text}', STYLES['bullet'])
def Label(text): return Paragraph(text, STYLES['label'])

def tag(text, color=INDIGO):
    return Paragraph(
        f'<font color="{color.hexval()}" name="Helvetica-Bold" size="8">[{text}]</font>',
        STYLES['caption']
    )

# ─── Page Template ────────────────────────────────────────
PAGE_W, PAGE_H = A4

def on_page(canvas, doc):
    canvas.saveState()
    # Header bar
    canvas.setFillColor(BG_CARD)
    canvas.rect(0, PAGE_H - 22*mm, PAGE_W, 22*mm, fill=1, stroke=0)
    canvas.setFillColor(INDIGO)
    canvas.rect(0, PAGE_H - 1.5*mm, PAGE_W, 1.5*mm, fill=1, stroke=0)
    canvas.setFillColor(FG2)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.drawString(2*cm, PAGE_H - 14*mm, '✦ TaskPilot')
    canvas.setFont('Helvetica', 8)
    canvas.drawRightString(PAGE_W - 2*cm, PAGE_H - 14*mm, 'Technical Documentation v1.0')
    # Footer
    canvas.setFillColor(BORDER)
    canvas.rect(0, 0, PAGE_W, 12*mm, fill=1, stroke=0)
    canvas.setFillColor(FG3)
    canvas.setFont('Helvetica', 7.5)
    canvas.drawString(2*cm, 4*mm, 'taskpilot.cc — Confidential')
    canvas.drawRightString(PAGE_W - 2*cm, 4*mm, f'Page {doc.page}')
    canvas.restoreState()

# ─── Content ──────────────────────────────────────────────
def cover_page():
    elements = []
    elements.append(sp(60))
    elements.append(Paragraph(
        '<font color="#6366f1" size="48" name="Helvetica-Bold">✦</font>',
        ParagraphStyle('logo_mark', alignment=TA_CENTER, leading=60)
    ))
    elements.append(sp(16))
    elements.append(Paragraph(
        '<font color="#f0f0ff" size="32" name="Helvetica-Bold">TaskPilot</font>',
        ParagraphStyle('cover_title', alignment=TA_CENTER, leading=40)
    ))
    elements.append(sp(8))
    elements.append(Paragraph(
        '<font color="#9898bb" size="14">The AI Operating Layer for the Browser</font>',
        ParagraphStyle('cover_sub', alignment=TA_CENTER, leading=20)
    ))
    elements.append(sp(32))
    elements.append(HRFlowable(width='60%', thickness=1, color=INDIGO, spaceAfter=24,
                                hAlign='CENTER'))
    elements.append(Paragraph(
        '<font color="#5a5a88" size="10">Technical Documentation &amp; Implementation Guide</font>',
        ParagraphStyle('cover_label', alignment=TA_CENTER)
    ))
    elements.append(sp(8))
    elements.append(Paragraph(
        '<font color="#5a5a88" size="9">Version 1.0 · 2025 · taskpilot.cc</font>',
        ParagraphStyle('cover_ver', alignment=TA_CENTER)
    ))
    elements.append(sp(80))
    data = [
        ['Stack', 'Next.js 14 · TypeScript · Supabase · Stripe · Upstash Redis'],
        ['Extension', 'Plasmo · Manifest V3 · Shadow DOM · Service Worker'],
        ['AI', 'OpenAI GPT-4.1-mini / GPT-4.1 · Semantic Caching · Token Optimizer'],
        ['Hosting', 'Vercel · Supabase Edge · Upstash · PostHog Analytics'],
    ]
    t = Table(data, colWidths=[4*cm, 12*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_CARD),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,0), (0,-1), INDIGO),
        ('TEXTCOLOR', (1,0), (1,-1), FG2),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
        ('RIGHTPADDING', (0,0), (-1,-1), 14),
        ('LINEABOVE', (0,0), (-1,0), 1, INDIGO),
        ('LINEBELOW', (0,-1), (-1,-1), 1, BORDER),
        ('LINEBEFORE', (0,0), (0,-1), 3, INDIGO),
    ]))
    elements.append(t)
    elements.append(PageBreak())
    return elements

def toc():
    elements = []
    elements.append(sp(8))
    elements.append(H('Table of Contents', 1))
    elements.append(sep())
    chapters = [
        ('01', 'Product Vision & Strategy', 'Positioning, target users, business model'),
        ('02', 'System Architecture', 'Monorepo structure, tech stack, data flow'),
        ('03', 'AI Orchestration Engine', 'Intent detection, tool routing, model selection'),
        ('04', 'Smart Paste System', '3-layer parsing, form detection, autofill'),
        ('05', 'Token Optimization', 'Cost reduction strategies, semantic caching'),
        ('06', 'Browser Extension', 'Manifest V3, content scripts, service worker'),
        ('07', 'Database Schema', 'Supabase tables, RLS policies, views'),
        ('08', 'API Design', 'Routes, auth, rate limiting, security'),
        ('09', 'Stripe Integration', 'Plans, webhooks, billing portal'),
        ('10', 'Security Architecture', 'CSP, rate limiting, abuse prevention'),
        ('11', 'Analytics &amp; Metrics', 'Usage tracking, cost monitoring, dashboards'),
        ('12', 'Deployment Guide', 'Vercel, Supabase, Chrome Web Store'),
    ]
    data = [[c[0], c[1], c[2]] for c in chapters]
    t = Table(data, colWidths=[1.5*cm, 7*cm, 8*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,0), (1,-1), 'Helvetica-Bold'),
        ('FONTNAME', (2,0), (2,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9.5),
        ('TEXTCOLOR', (0,0), (0,-1), INDIGO),
        ('TEXTCOLOR', (1,0), (1,-1), FG),
        ('TEXTCOLOR', (2,0), (2,-1), FG3),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 9),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LINEBELOW', (0,-1), (-1,-1), 0.5, BORDER),
    ]))
    elements.append(t)
    elements.append(PageBreak())
    return elements

def ch01():
    e = []
    e.append(ChapterDivider('01', 'Product Vision & Strategy', 'Positioning · Target Users · Business Model'))
    e.append(sp(12))
    e.append(H('1.1 Vision'))
    e.append(P('TaskPilot is not another AI chatbot. It is the AI operating layer for the browser — turning every webpage into an intelligent workspace where users can talk to content, automate workflows, extract data, and delegate browser tasks to AI. The core philosophy is: Ask → Execute → Done.'))
    e.append(sp(4))
    e.append(H('1.2 Primary Positioning'))
    data = [
        ['Tagline', '"Talk to any webpage instantly."'],
        ['Category', 'AI Browser Extension / Productivity SaaS'],
        ['Competitor feel', 'Cursor for the browser · Arc Browser AI · ChatGPT with execution'],
        ['Differentiator', 'LLM plans, browser engine executes — controlled, reliable automation'],
    ]
    t = Table(data, colWidths=[4*cm, 13*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9.5),
        ('TEXTCOLOR', (0,0), (0,-1), INDIGO),
        ('TEXTCOLOR', (1,0), (1,-1), FG2),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('LINEBEFORE', (0,0), (0,-1), 3, INDIGO),
    ]))
    e.append(t)
    e.append(sp(8))
    e.append(H('1.3 Target Users'))
    users = ['Recruiters (LinkedIn sourcing, ATS autofill)', 'Sales teams (CRM data entry, lead capture)',
             'E-commerce operators (product data extraction)', 'Agencies (client reporting, data collection)',
             'Founders (competitive research, lead gen)', 'Virtual assistants (browser task automation)',
             'Researchers (structured data extraction)', 'Growth marketers (SEO audits, SERP analysis)']
    for u in users: e.append(Bullet(u))
    e.append(sp(8))
    e.append(H('1.4 Business Model'))
    data2 = [
        ['Plan', 'Price', 'AI Actions/mo', 'Key Features'],
        ['Free', '$0', '30 actions\n5 exports', 'Smart Paste · Basic sidebar · CSV export'],
        ['Pro', '$19/mo\n$190/yr', 'Unlimited', 'All features · CRM integrations · Browser actions\nPremium AI · Workflow history · Priority support'],
        ['Enterprise', 'Custom', 'Unlimited', 'SSO · Team management · API access\nDedicated support · Custom models'],
    ]
    t2 = Table(data2, colWidths=[3*cm, 3*cm, 3.5*cm, 7.5*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,1), (-1,-1), FG2),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), FG),
    ]))
    e.append(t2)
    e.append(PageBreak())
    return e

def ch02():
    e = []
    e.append(ChapterDivider('02', 'System Architecture', 'Monorepo · Data Flow · Infrastructure'))
    e.append(sp(12))
    e.append(H('2.1 Monorepo Structure'))
    e.append(P('TaskPilot uses a Turborepo monorepo with four packages and two apps. All packages are TypeScript-first with strict mode enabled.'))
    struct = [
        'taskpilot/',
        '  apps/',
        '    web/              → Next.js 14 (landing page + dashboard + API)',
        '    extension/        → Chrome Extension via Plasmo (Manifest V3)',
        '  packages/',
        '    ai-engine/        → Orchestrator, optimizer, semantic cache, tool registry',
        '    browser-tools/    → Smart paste, form detection, export utilities',
        '    shared/           → Types, constants, PLAN_LIMITS, utilities',
        '    ui/               → Design system: buttons, cards, inputs',
        '  supabase/',
        '    migrations/       → PostgreSQL schema (001_initial_schema.sql)',
        '    functions/        → Edge Functions (ai-proxy)',
        '  scripts/',
        '    package-extension.js → Chrome Web Store packager',
    ]
    e.append(Code('\n'.join(struct)))
    e.append(sp(6))
    e.append(H('2.2 Request Data Flow'))
    flow = [
        ['Step', 'Component', 'Description'],
        ['1', 'Chrome Extension', 'User triggers action (Smart Paste / Sidebar / Command)'],
        ['2', 'Content Script', 'Extracts page context, forms, selected text via Shadow DOM'],
        ['3', 'Background SW', 'Rate limits request, appends session token, routes to API'],
        ['4', 'Next.js API', 'Auth check, security validation, cache lookup'],
        ['5', 'Semantic Cache', 'Returns cached result if hit (34%+ cache rate)'],
        ['6', 'AI Engine', 'Heuristic routing → token optimization → OpenAI call'],
        ['7', 'Supabase', 'Log request, increment usage counter, update metrics'],
        ['8', 'Response', 'Result streamed back to extension → rendered in sidebar'],
    ]
    t = Table(flow, colWidths=[1.2*cm, 4*cm, 11.8*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,1), (-1,-1), FG2),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), CYAN),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t)
    e.append(sp(8))
    e.append(H('2.3 Infrastructure'))
    infra = [
        ['Service', 'Provider', 'Purpose'],
        ['Web App + API', 'Vercel (Edge + Node)', 'Landing page, dashboard, API routes'],
        ['Database', 'Supabase (PostgreSQL 15)', 'User data, usage logs, workflows'],
        ['Edge Functions', 'Supabase Edge', 'AI proxy with rate limiting'],
        ['Cache + Rate Limits', 'Upstash Redis', 'Semantic cache, IP throttling'],
        ['AI Models', 'OpenAI', 'GPT-4.1-mini (default), GPT-4.1 (complex)'],
        ['Payments', 'Stripe', 'Subscriptions, webhooks, portal'],
        ['Analytics', 'PostHog', 'Usage tracking, funnels, retention'],
        ['CDN', 'Vercel Edge Network', 'Global delivery, 30+ PoPs'],
    ]
    t2 = Table(infra, colWidths=[4.5*cm, 5*cm, 7.5*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,1), (-1,-1), FG2),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), FG),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t2)
    e.append(PageBreak())
    return e

def ch03():
    e = []
    e.append(ChapterDivider('03', 'AI Orchestration Engine', 'Intent Detection · Tool Routing · Model Selection'))
    e.append(sp(12))
    e.append(H('3.1 Overview'))
    e.append(P('The AI engine in packages/ai-engine/ is the brain of TaskPilot. It receives user intent, selects tools, optimizes tokens, routes to the appropriate model, and assembles the final result. The design principle: LLM = Planner, Browser Engine = Executor.'))
    e.append(sp(4))
    e.append(H('3.2 Execution Pipeline'))
    steps = [
        ('1. Cache Check', 'SemanticCache.get() — SHA-hash of task+content+url. 34% avg hit rate.'),
        ('2. Heuristic Routing', 'For regex-friendly tasks (email, price extraction), skip AI entirely. ~40% of requests.'),
        ('3. Intent Detection', 'Map task type to TASK_TOOL_MAP → select execution tools.'),
        ('4. Token Optimization', 'TokenOptimizer strips boilerplate, compresses whitespace, limits content per task type.'),
        ('5. Model Selection', 'gpt-4.1-mini for simple/moderate. gpt-4.1 for complex tasks (replies, meeting notes).'),
        ('6. AI Call', 'OpenAI structured JSON output. System prompt is minimal — task-specific, under 100 tokens.'),
        ('7. Result Assembly', 'Parse AI output, merge with heuristic results, validate.'),
        ('8. Cache Write', 'Store result with TTL (1h default, 24h for stable content like translations).'),
    ]
    data = [['Step', 'Description']] + [[s[0], s[1]] for s in steps]
    t = Table(data, colWidths=[5*cm, 12*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,1), (-1,-1), FG2),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), INDIGO),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t)
    e.append(sp(8))
    e.append(H('3.3 Model Routing Logic'))
    e.append(Code('gpt-4.1-mini → summarize, translate, extract_emails, extract_prices,\n            smart_paste, rewrite, extract_tables\ngpt-4.1     → generate_reply, meeting_notes, custom (complex user prompts),\n            browser_action_plan'))
    e.append(sp(4))
    e.append(H('3.4 Tool Registry'))
    e.append(P('20 tools registered in packages/ai-engine/src/tools/tool-registry.ts. Each tool has a phase (1=local, 2=AI, 3=integration), cost weight (0.05–0.6), and handler function. Phase 1 tools run without any AI cost.'))
    tools = [
        ['Tool', 'Phase', 'Cost Weight', 'Description'],
        ['extract_visible_content', '1', '0.10', 'Raw page text extraction'],
        ['extract_emails', '1', '0.05', 'Regex email extraction (no AI)'],
        ['extract_prices', '1', '0.05', 'Regex price/currency extraction'],
        ['extract_links', '1', '0.05', 'URL extraction from content'],
        ['extract_tables', '1', '0.10', 'Table data from DOM'],
        ['detect_forms', '1', '0.10', 'Form field detection + labeling'],
        ['summarize_content', '2', '0.50', 'AI-powered page summary'],
        ['rewrite_text', '2', '0.40', 'Tone-specific text rewriting'],
        ['translate_content', '2', '0.60', 'Multi-language translation'],
        ['generate_reply', '2', '0.50', 'Context-aware reply generation'],
        ['autofill_fields', '2', '0.30', 'Intelligent form field filling'],
        ['export_csv', '2', '0.10', 'CSV export from extracted data'],
        ['export_excel', '2', '0.10', 'XLSX export with formatting'],
        ['export_pdf', '2', '0.20', 'PDF export from page content'],
        ['push_to_hubspot', '3', '0.20', 'HubSpot CRM integration'],
        ['push_to_salesforce', '3', '0.20', 'Salesforce CRM integration'],
        ['create_notion_page', '3', '0.20', 'Notion database entry creation'],
    ]
    t2 = Table(tools, colWidths=[5.5*cm, 1.5*cm, 2.5*cm, 7.5*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('TEXTCOLOR', (0,1), (-1,-1), FG2),
        ('FONTNAME', (0,1), (0,-1), 'Courier'),
        ('TEXTCOLOR', (0,1), (0,-1), CYAN),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t2)
    e.append(PageBreak())
    return e

def ch04():
    e = []
    e.append(ChapterDivider('04', 'Smart Paste System', '3-Layer Parsing · Form Detection · Animated Autofill'))
    e.append(sp(12))
    e.append(H('4.1 User Experience'))
    e.append(P('The Smart Paste system is the viral MVP feature. The user copies messy text (e.g. a LinkedIn profile or business card) and clicks Smart Paste (or presses Alt+V). TaskPilot detects form fields on the page, maps clipboard data to fields intelligently, and autofills them with an animated highlight effect.'))
    e.append(sp(6))
    e.append(H('4.2 Three-Layer Parsing'))
    layers = [
        ('Layer 1: Regex (no AI cost)',
         ['Email: /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/',
          'Phone: international format with country codes',
          'URLs, LinkedIn/Twitter handles, zip codes',
          'Dates in multiple formats']),
        ('Layer 2: Heuristics (no AI cost)',
         ['"Title at Company" pattern → splits jobTitle + company',
          'Title-case 2+ words → firstName + lastName',
          'JOB_TITLE_SIGNALS array (CEO, CTO, VP, Director, ...)',
          'COMPANY_SIGNALS (Inc, Ltd, Corp, Group, ...)',
          'DOM proximity labels (for/aria-label/sibling/ancestor)',
          'Confidence scoring: 0.0–1.0']),
        ('Layer 3: AI (only if confidence &lt; 0.7)',
         ['gpt-4.1-mini with structured JSON output',
          'System prompt under 80 tokens',
          'Only called for ambiguous/complex clipboard content',
          'Merges with heuristic results',
          'Skipped for >60% of requests']),
    ]
    for title, bullets in layers:
        e.append(Label(title))
        for b in bullets: e.append(Bullet(b))
        e.append(sp(4))
    e.append(H('4.3 Form Detection Engine'))
    e.append(P('The content script\'s detectFormFields() function finds all visible form elements and extracts semantic labels via 4 methods (in priority order):'))
    methods = [
        ['Priority', 'Method', 'Example'],
        ['1', 'for= attribute on label', '<label for="email">Email</label>'],
        ['2', 'aria-label on input', '<input aria-label="Email address">'],
        ['3', 'Ancestor <label> element', '<label>Email <input type="email"></label>'],
        ['4', 'Preceding sibling text', '<span>Email</span> <input type="email">'],
    ]
    t = Table(methods, colWidths=[2*cm, 5*cm, 10*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('FONTNAME', (2,1), (2,-1), 'Courier'),
        ('TEXTCOLOR', (2,1), (2,-1), CYAN),
        ('TEXTCOLOR', (0,1), (1,-1), FG2),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t)
    e.append(sp(8))
    e.append(H('4.4 React/Vue Compatibility'))
    e.append(P('Standard DOM value assignment breaks React/Vue controlled inputs. The animatedAutofill() function uses the native input value setter + dispatches InputEvent with bubbles:true to ensure framework state syncs correctly. This is critical for HubSpot, Salesforce, and Airtable.'))
    e.append(Code("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')\n  .set.call(input, value)\ninput.dispatchEvent(new Event('input', { bubbles: true }))\ninput.dispatchEvent(new Event('change', { bubbles: true }))"))
    e.append(PageBreak())
    return e

def ch05():
    e = []
    e.append(ChapterDivider('05', 'Token Optimization', 'Cost Reduction · Semantic Cache · Analytics'))
    e.append(sp(12))
    e.append(H('5.1 Strategy Overview'))
    e.append(P('AI inference cost is the primary variable cost at scale. TaskPilot\'s target is <$0.00015 per request after all optimizations. The five-layer approach achieves 60-80% cost reduction versus a naive implementation.'))
    e.append(sp(6))
    strategies = [
        ('Local-first parsing', 'Heuristics handle ~40% of requests, regex handles ~20%. No AI call needed.', GREEN),
        ('Semantic caching', '34%+ cache hit rate. Same page + same task = instant result at $0 cost.', CYAN),
        ('Token limits per task', 'smart_paste: 500 chars · summarize: 3000 · export: 4000 max content.', INDIGO),
        ('Boilerplate stripping', 'Removes cookie notices, nav menus, footer links (~20-30% reduction).', AMBER),
        ('Model routing', 'gpt-4.1-mini by default. 10x cheaper than gpt-4.1 for suitable tasks.', FG2),
    ]
    for title, desc, color in strategies:
        e.append(KeepTogether([
            Paragraph(f'<font color="{color.hexval()}" name="Helvetica-Bold">■</font>  <font name="Helvetica-Bold" size="10">{title}</font>',
                      ParagraphStyle('s', fontSize=10, leading=14, spaceAfter=2)),
            P(desc),
        ]))
    e.append(sp(8))
    e.append(H('5.2 Per-Task Content Limits'))
    limits = [
        ['Task', 'Max Content (chars)', 'Rationale'],
        ['smart_paste', '500', 'Only clipboard text — short by nature'],
        ['extract_emails', '10,000', 'Needs full page scan'],
        ['extract_prices', '8,000', 'Product listings can be long'],
        ['summarize', '3,000', 'First 3k chars captures the gist'],
        ['translate', '4,000', 'Balance quality vs cost'],
        ['generate_reply', '2,000', 'Message context is usually short'],
        ['export_pdf', '4,000', 'Section limit for AI-assisted export'],
        ['custom (user prompt)', '6,000', 'Broad queries may need more context'],
    ]
    t = Table(limits, colWidths=[5*cm, 4.5*cm, 7.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('FONTNAME', (0,1), (0,-1), 'Courier'),
        ('TEXTCOLOR', (0,1), (0,-1), CYAN),
        ('TEXTCOLOR', (1,1), (1,-1), FG),
        ('TEXTCOLOR', (2,1), (2,-1), FG2),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t)
    e.append(sp(8))
    e.append(H('5.3 Cost Model'))
    e.append(Code('gpt-4.1-mini:  $0.00000015 / token  (input + output)\ngpt-4.1:      $0.0000025  / token\n\nAverage request: ~800 tokens after optimization\nCost per request (mini, no cache): $0.00012\nCost per request (after 34% cache): $0.000079\nPro plan break-even at $19/mo: ~240,000 requests'))
    e.append(PageBreak())
    return e

def ch06():
    e = []
    e.append(ChapterDivider('06', 'Browser Extension', 'Manifest V3 · Content Scripts · Service Worker'))
    e.append(sp(12))
    e.append(H('6.1 Architecture'))
    e.append(P('The Chrome extension uses Plasmo Framework with Manifest V3. Three core components: background service worker (persistent state, rate limiting, context menus), content script (page interaction, Shadow DOM sidebar, form detection), and popup UI (quick actions, AI input, recent history).'))
    e.append(sp(6))
    e.append(H('6.2 Permissions'))
    perms = [
        ['Permission', 'Type', 'Purpose'],
        ['storage', 'Required', 'Session token, usage counters, settings'],
        ['clipboardRead', 'Required', 'Smart Paste — read clipboard content'],
        ['clipboardWrite', 'Required', 'Copy AI results to clipboard'],
        ['activeTab', 'Required', 'Access current tab content and URL'],
        ['scripting', 'Required', 'Execute content scripts dynamically'],
        ['contextMenus', 'Required', 'Right-click menu (Summarize, Extract, etc.)'],
        ['alarms', 'Required', 'Hourly session sync for logged-in users'],
        ['tabs', 'Optional', 'Access tab list for multi-tab workflows'],
        ['&lt;all_urls&gt;', 'Optional', 'Full URL access for advanced automation'],
    ]
    t = Table(perms, colWidths=[4*cm, 2.5*cm, 10.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('FONTNAME', (0,1), (0,-1), 'Courier'), ('TEXTCOLOR', (0,1), (0,-1), CYAN),
        ('TEXTCOLOR', (1,1), (1,4), GREEN), ('TEXTCOLOR', (1,5), (1,8), AMBER),
        ('TEXTCOLOR', (1,9), (1,-1), FG3),
        ('TEXTCOLOR', (2,1), (2,-1), FG2),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t)
    e.append(sp(8))
    e.append(H('6.3 Shadow DOM Isolation'))
    e.append(P('The sidebar is injected into a Shadow DOM container, completely isolating TaskPilot\'s styles from the host page. This prevents CSS conflicts on 99.9% of websites and ensures consistent rendering across all domains.'))
    e.append(Code("const host = document.createElement('div')\nhost.id = 'taskpilot-root'\nconst shadow = host.attachShadow({ mode: 'closed' })\nconst iframe = document.createElement('iframe')\niframe.src = chrome.runtime.getURL('sidebar.html')\nshadow.appendChild(iframe)"))
    e.append(sp(6))
    e.append(H('6.4 Keyboard Shortcuts'))
    shortcuts = [
        ['Shortcut', 'Action'],
        ['Alt+T', 'Open TaskPilot (popup)'],
        ['Alt+V', 'Smart Paste (autofill from clipboard)'],
        ['Alt+S', 'Toggle AI Sidebar'],
        ['Alt+K', 'Open AI Command Palette'],
        ['Escape', 'Close sidebar / dismiss notification'],
    ]
    t2 = Table(shortcuts, colWidths=[4*cm, 13*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO_DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9.5),
        ('FONTNAME', (0,1), (0,-1), 'Courier'), ('TEXTCOLOR', (0,1), (0,-1), CYAN),
        ('TEXTCOLOR', (1,1), (1,-1), FG2),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BG_CARD, BG_DARK]),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('GRID', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    e.append(t2)
    e.append(PageBreak())
    return e

def ch07_to_12():
    e = []
    chapters = [
        ('07', 'Database Schema', [
            ('Tables', [
                'profiles — user accounts, plan, stripe_customer_id',
                'anonymous_sessions — fingerprint + IP hash, 24h expiry, usage counters',
                'subscriptions — Stripe subscription state (synced via webhook)',
                'ai_requests — all AI calls: task, model, tokens, cost, cached flag',
                'usage_periods — monthly counters per user (resets at month start)',
                'productivity_metrics — daily actions, forms filled, time saved per user',
                'workflows — saved automation sequences',
                'response_cache — semantic cache warm data',
                'saved_prompts — 6 defaults seeded + user custom prompts',
            ]),
            ('Security', [
                'Row Level Security (RLS) enabled on ALL user tables',
                'Policy: users can only SELECT/UPDATE their own rows',
                'Service role key only used server-side (never in browser)',
                'Anonymous sessions use SHA-256 fingerprint (IP + UA + timezone)',
            ]),
            ('Views', [
                'v_daily_stats — DAU, token costs, cache hits, task breakdown',
                'v_user_ltv — lifetime value per user (total cost vs revenue)',
            ]),
        ]),
        ('08', 'API Design', [
            ('Routes', [
                'POST /api/ai/smart-paste — clipboard parsing + form field mapping',
                'POST /api/ai/process — all sidebar tasks (summarize, extract, etc.)',
                'POST /api/stripe/webhook — Stripe events (signed, idempotent)',
                'GET/POST/DELETE /api/auth/session — session management',
                'POST /api/export — CSV / Excel / JSON generation',
            ]),
            ('Auth Pattern', [
                'Supabase Auth (JWT) for authenticated users',
                'Anonymous session token in X-Session-Token header for guests',
                'Extension sends Origin: chrome-extension://&lt;id&gt;',
                'CORS whitelist: taskpilot.cc + localhost:3000 + chrome-extension://*',
            ]),
            ('Rate Limits (per IP per minute)', [
                'smart-paste: 30 req/min',
                'process: 60 req/min',
                'auth: 10 req/min',
                'export: 20 req/min',
            ]),
        ]),
        ('09', 'Stripe Integration', [
            ('Plans', [
                'Free: $0 — enforced via Supabase usage counters (no Stripe needed)',
                'Pro Monthly: $19/mo (STRIPE_PRICE_PRO_MONTHLY)',
                'Pro Annual: $190/yr (STRIPE_PRICE_PRO_ANNUAL) — 17% discount',
                'Enterprise: custom pricing via Stripe quote',
            ]),
            ('Webhooks', [
                'checkout.session.completed — create subscription record',
                'customer.subscription.updated — sync plan changes',
                'customer.subscription.deleted — downgrade to free',
                'invoice.payment_succeeded — log billing event',
                'invoice.payment_failed — flag account, email user',
            ]),
            ('Trial', [
                '7-day free trial on Pro (no card required for Free)',
                'Trial via Stripe checkout session trial_period_days: 7',
                'Promotion codes enabled (allow_promotion_codes: true)',
            ]),
        ]),
        ('10', 'Security Architecture', [
            ('Client-Side', [
                'Shadow DOM isolation — no CSS/JS conflicts with host pages',
                'Minimal permissions — activeTab only, no broad host permissions required',
                'Content Security Policy hardened in manifest.json',
                'All secrets server-side only — extension uses API proxy',
            ]),
            ('Server-Side', [
                'Rate limiting: Redis sliding window per IP (INCR + EXPIRE)',
                'Burst detection: &gt;15 requests in 5 seconds = temporary block',
                'Input sanitization: strip &lt;script&gt;, javascript:, on* handlers',
                'Content length limits: 20k chars max per request',
                'Extension CORS: chrome-extension:// origin whitelist',
                'Strict CSP headers on all responses',
                'X-Frame-Options: DENY, HSTS, Permissions-Policy',
            ]),
            ('AI Safety', [
                'task_type whitelist — only 20 known task types accepted',
                'URL validation — no internal/localhost URLs',
                'Content sanitization before AI call',
                'Structured outputs only — JSON schema enforced',
            ]),
        ]),
        ('11', 'Analytics &amp; Metrics', [
            ('User Metrics', [
                'Daily Active Users (DAU), Weekly Active Users (WAU)',
                'Feature adoption rates (Smart Paste vs Sidebar vs Actions)',
                'Conversion: free → pro',
                'Retention D1/D7/D30',
                'Session quality (actions per session, completion rate)',
            ]),
            ('AI Cost Metrics', [
                'Tokens used per user, per task type',
                'Cache hit rate (target: &gt;30%)',
                'Average cost per request',
                'Model distribution (mini vs full)',
                'Cost per MAU estimate',
            ]),
            ('Business Metrics', [
                'MRR, ARR growth',
                'CAC (cost per acquired user)',
                'LTV per plan tier',
                'Churn rate (monthly)',
                'Expansion revenue (free → pro upgrades)',
            ]),
        ]),
        ('12', 'Deployment Guide', [
            ('Web App (Vercel)', [
                '1. Connect GitHub repo to Vercel',
                '2. Set Root Directory: apps/web',
                '3. Add all env vars from .env.example',
                '4. Deploy: vercel --prod',
                '5. Verify: https://taskpilot.cc/api/auth/session',
            ]),
            ('Database (Supabase)', [
                '1. Create project at supabase.com',
                '2. Run: supabase db push --linked',
                '3. Enable Anonymous Sign-ins in Auth settings',
                '4. Deploy edge function: supabase functions deploy ai-proxy',
                '5. Set function secrets via Supabase dashboard',
            ]),
            ('Chrome Extension', [
                '1. Build: cd apps/extension &amp;&amp; npm run build',
                '2. Package: node scripts/package-extension.js',
                '3. Upload dist/taskpilot-extension-prod-*.zip to Chrome Web Store',
                '4. Submit for review (5-7 business days)',
                '5. Update manifest.json version for each release',
            ]),
        ]),
    ]

    for num, title, sections in chapters:
        e.append(ChapterDivider(num, title))
        e.append(sp(12))
        for section_title, items in sections:
            e.append(H(section_title, 3))
            for item in items:
                e.append(Bullet(item))
            e.append(sp(6))
        e.append(PageBreak())
    return e

# ─── Build PDF ────────────────────────────────────────────
def build():
    output_path = '/home/claude/taskpilot/docs/TaskPilot-Technical-Documentation.pdf'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=2.5*cm, bottomMargin=1.8*cm,
        leftMargin=2*cm, rightMargin=2*cm,
        title='TaskPilot Technical Documentation',
        author='TaskPilot Engineering',
        subject='Full-stack AI Browser Extension SaaS',
    )

    story = []
    story += cover_page()
    story += toc()
    story += ch01()
    story += ch02()
    story += ch03()
    story += ch04()
    story += ch05()
    story += ch06()
    story += ch07_to_12()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f'✅ PDF generated: {output_path}')
    return output_path

if __name__ == '__main__':
    build()
