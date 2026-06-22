// ============================================================
// TASKPILOT — SMART PASTE ENGINE
// packages/browser-tools/src/smart-paste.ts
// Multi-layer parsing: Regex → Heuristics → AI
// ============================================================

import type {
  SmartPasteRequest,
  SmartPasteResult,
  FieldMapping,
  FormField,
  SemanticFieldType,
  ParsingLayer,
} from "@taskpilot/shared/types";

// ─── LAYER 1: REGEX PATTERNS ──────────────────────────────────

const REGEX_PATTERNS: Record<SemanticFieldType, RegExp | null> = {
  email: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  url: /https?:\/\/[^\s"'<>]+/g,
  linkedin: /linkedin\.com\/in\/[a-zA-Z0-9\-]+/g,
  twitter: /@[a-zA-Z0-9_]{1,15}|twitter\.com\/[a-zA-Z0-9_]{1,15}/g,
  zip: /\b\d{5}(?:[-\s]\d{4})?\b/g,
  date: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/g,
  // These require heuristic detection
  first_name: null,
  last_name: null,
  full_name: null,
  company: null,
  job_title: null,
  address: null,
  city: null,
  country: null,
  message: null,
  subject: null,
  unknown: null,
};

// ─── LAYER 2: HEURISTIC SIGNALS ──────────────────────────────

const LABEL_HEURISTICS: Record<SemanticFieldType, RegExp[]> = {
  first_name: [/first\s*name/i, /prénom/i, /given\s*name/i, /fname/i],
  last_name: [/last\s*name/i, /nom/i, /surname/i, /family\s*name/i, /lname/i],
  full_name: [/^name$/i, /full\s*name/i, /your\s*name/i, /contact\s*name/i],
  email: [/e?mail/i, /email\s*address/i, /courriel/i],
  phone: [/phone/i, /tel(?:ephone)?/i, /mobile/i, /cell/i],
  company: [/company/i, /organization/i, /business/i, /employer/i, /firm/i],
  job_title: [/title/i, /job\s*title/i, /position/i, /role/i, /function/i],
  address: [/address/i, /street/i, /rue/i, /adresse/i],
  city: [/city/i, /ville/i, /town/i, /municipality/i],
  country: [/country/i, /pays/i, /nation/i],
  zip: [/zip/i, /postal/i, /postcode/i, /code\s*postal/i],
  url: [/website/i, /url/i, /web\s*site/i, /homepage/i],
  linkedin: [/linkedin/i],
  twitter: [/twitter/i, /x\.com/i],
  message: [/message/i, /comment/i, /description/i, /notes?/i, /remarks?/i],
  subject: [/subject/i, /sujet/i, /topic/i],
  date: [/date/i, /birthday/i, /born/i],
  unknown: [],
};

// Known job title indicators
const JOB_TITLE_SIGNALS = [
  "CEO", "CTO", "CFO", "COO", "VP", "Director", "Manager", "Engineer",
  "Developer", "Designer", "Analyst", "Consultant", "Founder", "President",
  "Head of", "Lead", "Senior", "Junior", "Principal", "Chief",
];

// Known company indicators (domain extensions, "Inc", "LLC", etc.)
const COMPANY_SIGNALS = /\b(?:Inc\.?|LLC|Ltd\.?|Corp\.?|GmbH|SAS|SA|SRL|B\.V\.)\b/i;

// ─── STRUCTURED DATA PARSER ───────────────────────────────────

export class SmartPasteEngine {

  // ── PUBLIC API ──────────────────────────────────────────

  parse(request: SmartPasteRequest): SmartPasteResult {
    const { clipboard_text, page_context } = request;
    
    // Step 1: Extract typed data via regex
    const extractedData = this.extractWithRegex(clipboard_text);
    
    // Step 2: Infer name/company/title via heuristics
    const heuristicData = this.inferWithHeuristics(clipboard_text, extractedData);
    
    // Step 3: Map to form fields
    const { mappings, unmapped } = this.mapToFields(
      { ...extractedData, ...heuristicData },
      page_context.detected_forms
    );

    const confidence = this.calculateOverallConfidence(mappings);
    const layersUsed: ParsingLayer[] = ["regex"];
    if (Object.keys(heuristicData).length > 0) layersUsed.push("heuristic");

    return {
      mappings,
      unmapped_data: unmapped,
      confidence,
      parsing_layers_used: layersUsed,
    };
  }

  // ── LAYER 1: REGEX EXTRACTION ───────────────────────────

  private extractWithRegex(text: string): Partial<Record<SemanticFieldType, string>> {
    const result: Partial<Record<SemanticFieldType, string>> = {};

    for (const [fieldType, pattern] of Object.entries(REGEX_PATTERNS)) {
      if (!pattern) continue;
      const match = text.match(pattern);
      if (match && match[0]) {
        result[fieldType as SemanticFieldType] = match[0].trim();
      }
    }

    return result;
  }

  // ── LAYER 2: HEURISTIC INFERENCE ────────────────────────

  private inferWithHeuristics(
    text: string,
    extracted: Partial<Record<SemanticFieldType, string>>
  ): Partial<Record<SemanticFieldType, string>> {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const result: Partial<Record<SemanticFieldType, string>> = {};
    
    // Remove already-extracted content from analysis
    const cleanedLines = lines.filter((line) => {
      return !Object.values(extracted).some((val) => val && line.includes(val));
    });

    for (const line of cleanedLines) {
      // Job title detection
      const isJobTitle = JOB_TITLE_SIGNALS.some((signal) =>
        line.toLowerCase().includes(signal.toLowerCase())
      );
      if (isJobTitle && !result.job_title && line.length < 60) {
        // Check if it's "Title at Company" pattern
        const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
        if (atMatch) {
          result.job_title = atMatch[1].trim();
          if (!result.company) result.company = atMatch[2].trim();
          continue;
        }
        result.job_title = line;
        continue;
      }

      // Company detection
      if (COMPANY_SIGNALS.test(line) && !result.company && line.length < 80) {
        result.company = line;
        continue;
      }

      // Name detection (first unclassified short line, title case)
      if (!result.full_name && !result.first_name && line.length < 50) {
        const words = line.split(/\s+/);
        const isTitleCase = words.every(
          (w) => w.length === 0 || w[0] === w[0].toUpperCase()
        );
        if (isTitleCase && words.length >= 2 && words.length <= 4) {
          if (words.length === 2) {
            result.first_name = words[0];
            result.last_name = words[1];
          } else {
            result.full_name = line;
          }
          continue;
        }
      }
    }

    return result;
  }

  // ── FIELD MAPPING ────────────────────────────────────────

  private mapToFields(
    data: Partial<Record<SemanticFieldType, string>>,
    fields: FormField[]
  ): { mappings: FieldMapping[]; unmapped: Record<string, string> } {
    const mappings: FieldMapping[] = [];
    const usedData = new Set<SemanticFieldType>();

    for (const field of fields) {
      // Detect field semantic type from labels/name/placeholder
      const semanticType = this.detectFieldSemantic(field);
      
      // Find matching data
      let value: string | undefined;
      let confidence = 0;
      let source: ParsingLayer = "heuristic";

      if (semanticType !== "unknown" && data[semanticType]) {
        value = data[semanticType];
        confidence = 0.85;
        source = REGEX_PATTERNS[semanticType] ? "regex" : "heuristic";
        usedData.add(semanticType);
      }

      // Handle full_name → first_name/last_name split
      if (!value && (semanticType === "first_name") && data.full_name) {
        const parts = data.full_name.split(/\s+/);
        value = parts[0];
        confidence = 0.75;
        source = "heuristic";
      }
      if (!value && (semanticType === "last_name") && data.full_name) {
        const parts = data.full_name.split(/\s+/);
        value = parts.slice(1).join(" ");
        confidence = 0.75;
        source = "heuristic";
      }
      // Handle first_name+last_name → full_name
      if (!value && semanticType === "full_name" && data.first_name && data.last_name) {
        value = `${data.first_name} ${data.last_name}`;
        confidence = 0.8;
        source = "heuristic";
      }

      if (value) {
        mappings.push({
          field,
          value,
          confidence,
          source,
        });
      }
    }

    // Build unmapped data
    const unmapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && !usedData.has(key as SemanticFieldType)) {
        unmapped[key] = value;
      }
    }

    return { mappings, unmapped };
  }

  // ── FIELD SEMANTIC DETECTION ─────────────────────────────

  private detectFieldSemantic(field: FormField): SemanticFieldType {
    // Use pre-computed semantic type if available
    if (field.semantic_type && field.semantic_type !== "unknown") {
      return field.semantic_type;
    }

    const searchText = [
      field.label || "",
      field.name || "",
      field.placeholder || "",
      field.id || "",
    ]
      .join(" ")
      .toLowerCase();

    for (const [fieldType, patterns] of Object.entries(LABEL_HEURISTICS)) {
      if (fieldType === "unknown") continue;
      if (patterns.some((p) => p.test(searchText))) {
        return fieldType as SemanticFieldType;
      }
    }

    return "unknown";
  }

  // ── CONFIDENCE SCORING ───────────────────────────────────

  private calculateOverallConfidence(mappings: FieldMapping[]): number {
    if (mappings.length === 0) return 0;
    const avg = mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length;
    return Math.round(avg * 100) / 100;
  }
}

// ─── FORM FIELD DETECTOR (DOM side) ──────────────────────────
// This runs in the content script context

export function detectFormFields(document: Document): FormField[] {
  const fields: FormField[] = [];
  
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='image']), textarea, select"
  );

  inputs.forEach((el, index) => {
    const field = buildFormField(el, index, document);
    if (field) fields.push(field);
  });

  return fields;
}

function buildFormField(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  index: number,
  document: Document
): FormField | null {
  // Skip invisible fields
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  if ((el as HTMLInputElement).offsetWidth === 0) return null;

  // Find associated label
  let label = "";
  
  // Method 1: for attribute
  if (el.id) {
    const labelEl = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`);
    if (labelEl) label = labelEl.textContent?.trim() || "";
  }
  
  // Method 2: ancestor label
  if (!label) {
    const ancestorLabel = el.closest("label");
    if (ancestorLabel) {
      label = ancestorLabel.textContent?.replace(el.value, "").trim() || "";
    }
  }
  
  // Method 3: preceding sibling text
  if (!label) {
    const prev = el.previousElementSibling;
    if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "P")) {
      label = prev.textContent?.trim() || "";
    }
  }
  
  // Method 4: aria-label
  if (!label) {
    label = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || "";
  }

  const selector = buildSelector(el, index);

  return {
    id: el.id || undefined,
    name: el.name || undefined,
    type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
    label: label || undefined,
    placeholder: (el as HTMLInputElement).placeholder || undefined,
    value: el.value || undefined,
    required: el.required,
    confidence: label ? 0.9 : 0.6,
    element_selector: selector,
  };
}

function buildSelector(el: Element, index: number): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.getAttribute("name")) {
    return `[name="${el.getAttribute("name")}"]`;
  }
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type;
  return type ? `${tag}[type="${type}"]:nth-of-type(${index + 1})` : `${tag}:nth-of-type(${index + 1})`;
}
