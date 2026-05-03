import JSZip from 'jszip';

export interface StudyData {
  nombre_paciente: string;
  tipo_estudio: string;
  region: string;
  lateralidad: string | null;
  hallazgos: string;
  conclusiones: string;
  datos_clinicos: string;
}

// Extract all text content from a paragraph element
function getParagraphText(p: Element): string {
  const texts = Array.from(p.getElementsByTagName('w:t'));
  return texts.map(t => t.textContent || '').join('');
}

// Get the run properties (formatting) from a paragraph's first run
function getRunProperties(p: Element, doc: Document): Element | null {
  const firstRun = p.getElementsByTagName('w:r')[0];
  if (firstRun) {
    const rPr = firstRun.getElementsByTagName('w:rPr')[0];
    return rPr ? rPr.cloneNode(true) as Element : null;
  }
  return null;
}

// Search multiple paragraphs in a range for the best formatting reference
// Returns { pPr, rPr } from the first paragraph that has actual inline run properties
function findBestFormattingReference(
  paragraphs: Element[],
  startIdx: number,
  endIdx: number,
  doc: Document
): { pPr: Element | null; rPr: Element | null } {
  let bestPPr: Element | null = null;
  let bestRPr: Element | null = null;

  for (let i = startIdx; i < Math.min(endIdx, paragraphs.length); i++) {
    const p = paragraphs[i];
    const text = getParagraphText(p).trim();
    if (text.length === 0) continue; // skip empty paragraphs

    if (!bestPPr) {
      bestPPr = getParagraphProperties(p);
    }

    const rPr = getRunProperties(p, doc);
    if (rPr) {
      bestRPr = rPr;
      if (!bestPPr) bestPPr = getParagraphProperties(p);
      break; // found a paragraph with actual inline formatting
    }
  }

  return { pPr: bestPPr, rPr: bestRPr };
}

// Get paragraph properties from a paragraph
function getParagraphProperties(p: Element): Element | null {
  const pPr = p.getElementsByTagName('w:pPr')[0];
  return pPr ? pPr.cloneNode(true) as Element : null;
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Create run properties for Arial 10 black font
function createArialRunProperties(doc: Document, bold = false): Element {
  const rPr = doc.createElementNS(W_NS, 'w:rPr');
  
  const rFonts = doc.createElementNS(W_NS, 'w:rFonts');
  rFonts.setAttribute('w:ascii', 'Arial');
  rFonts.setAttribute('w:hAnsi', 'Arial');
  rFonts.setAttribute('w:cs', 'Arial');
  rPr.appendChild(rFonts);

  if (bold) {
    const b = doc.createElementNS(W_NS, 'w:b');
    rPr.appendChild(b);
    const bCs = doc.createElementNS(W_NS, 'w:bCs');
    rPr.appendChild(bCs);
  }
  
  const sz = doc.createElementNS(W_NS, 'w:sz');
  sz.setAttribute('w:val', '20'); // 10pt = 20 half-points
  rPr.appendChild(sz);
  
  const szCs = doc.createElementNS(W_NS, 'w:szCs');
  szCs.setAttribute('w:val', '20');
  rPr.appendChild(szCs);
  
  const color = doc.createElementNS(W_NS, 'w:color');
  color.setAttribute('w:val', '000000');
  rPr.appendChild(color);
  
  return rPr;
}

// Create a new text paragraph preserving original template formatting
// Uses existing rPr from template content; falls back to Arial 10 only if none found
function createTextParagraph(
  doc: Document,
  text: string,
  pPr: Element | null,
  existingRPr: Element | null = null,
  bold = false
): Element {
  const p = doc.createElementNS(W_NS, 'w:p');

  if (pPr) {
    p.appendChild(pPr.cloneNode(true));
  }

  const r = doc.createElementNS(W_NS, 'w:r');

  if (existingRPr) {
    // Clone the template's original run properties (font, size, color, spacing, etc.)
    const clonedRPr = existingRPr.cloneNode(true) as Element;
    if (bold) {
      // Add bold if not already present
      if (!clonedRPr.getElementsByTagName('w:b')[0]) {
        clonedRPr.appendChild(doc.createElementNS(W_NS, 'w:b'));
      }
      if (!clonedRPr.getElementsByTagName('w:bCs')[0]) {
        clonedRPr.appendChild(doc.createElementNS(W_NS, 'w:bCs'));
      }
    }
    r.appendChild(clonedRPr);
  } else {
    // Fallback only when no template formatting exists
    r.appendChild(createArialRunProperties(doc, bold));
  }

  const t = doc.createElementNS(W_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);

  return p;
}

// Find index of paragraph containing any of the keywords
function findSectionIndex(paragraphs: Element[], keywords: string[]): number {
  return paragraphs.findIndex(p => {
    const text = getParagraphText(p).toLowerCase().trim();
    return keywords.some(kw => text.includes(kw.toLowerCase()));
  });
}

// Check if a paragraph is a section header (keyword near the start of text)
function isSectionHeaderParagraph(text: string): boolean {
  const trimmed = text.toLowerCase().trim();
  if (trimmed.length === 0) return false;
  return ALL_SECTION_KW.some(kw => {
    const idx = trimmed.indexOf(kw.toLowerCase());
    // Keyword must be at or very near the beginning (within first 5 chars)
    // to be considered a section header, not content that happens to contain the word
    return idx >= 0 && idx <= 5;
  });
}

// Section keyword definitions
const HALLAZGOS_KW = ['hallazgos', 'findings', 'descripción', 'descripcion'];
const CONCLUSIONES_KW = ['conclusiones', 'conclusión', 'conclusion', 'impresión diagnóstica', 'impresion diagnostica', 'impresión diagnostica', 'diagnostica'];
const DATOS_KW = ['datos clínicos', 'datos clinicos', 'diagnóstico', 'diagnostico', 'indicación', 'indicacion', 'indicaciones clínicas', 'indicaciones clinicas'];
const ALL_SECTION_KW = [...HALLAZGOS_KW, ...CONCLUSIONES_KW, ...DATOS_KW, 'técnica', 'tecnica', 'comparación', 'comparacion'];

function insertBeforeExistingContent(
  body: Element,
  doc: Document,
  sectionKeywords: string[],
  newContent: string
) {
  const paragraphs = Array.from(body.getElementsByTagName('w:p'));
  const sectionIdx = findSectionIndex(paragraphs, sectionKeywords);

  if (sectionIdx === -1) return;

  // The insertion point is right after the section header
  const sectionHeader = paragraphs[sectionIdx];
  const insertBefore = sectionHeader.nextSibling;

  // Insert new content lines BEFORE the existing content (right after header)
  const lines = newContent.split('\n').filter(l => l.trim());
  // Search for the best formatting reference from content paragraphs in this section
  let nextSectionIdx = paragraphs.length;
  for (let i = sectionIdx + 1; i < paragraphs.length; i++) {
    const text = getParagraphText(paragraphs[i]).trim();
    if (text.length > 0 && isSectionHeaderParagraph(text)) {
      nextSectionIdx = i;
      break;
    }
  }
  const { pPr: contentPPr, rPr: contentRPr } = findBestFormattingReference(
    paragraphs, sectionIdx + 1, nextSectionIdx, doc
  );

  for (const line of lines) {
    const newP = createTextParagraph(doc, line, contentPPr, contentRPr);
    body.insertBefore(newP, insertBefore);
  }
}

function replaceSectionContent(
  body: Element,
  doc: Document,
  sectionKeywords: string[],
  newContent: string,
  bold = false
) {
  const paragraphs = Array.from(body.getElementsByTagName('w:p'));
  const sectionIdx = findSectionIndex(paragraphs, sectionKeywords);

  if (sectionIdx === -1) return;

  // Check if the section header itself contains content after the keyword (e.g. "INDICACIÓN: some text")
  // If so, clear that text from the header paragraph, keeping only the label
  const headerText = getParagraphText(paragraphs[sectionIdx]);
  const headerLower = headerText.toLowerCase().trim();
  for (const kw of sectionKeywords) {
    const kwLower = kw.toLowerCase();
    const kwIdx = headerLower.indexOf(kwLower);
    if (kwIdx !== -1) {
      // There might be content after the keyword on the same line - clear runs after keyword
      const runs = Array.from(paragraphs[sectionIdx].getElementsByTagName('w:r'));
      let charCount = 0;
      const cutPoint = kwIdx + kwLower.length;
      for (const run of runs) {
        const tElements = Array.from(run.getElementsByTagName('w:t'));
        for (const t of tElements) {
          const txt = t.textContent || '';
          const runStart = charCount;
          const runEnd = charCount + txt.length;
          if (runStart >= cutPoint) {
            // This entire text node is after the keyword - clear it
            t.textContent = '';
          } else if (runEnd > cutPoint) {
            // Partially overlaps - keep only up to cutPoint, plus colon/space
            const keepLen = cutPoint - runStart;
            let kept = txt.substring(0, keepLen);
            // Keep trailing colon and spaces
            const rest = txt.substring(keepLen);
            const colonMatch = rest.match(/^[:\s]*/);
            if (colonMatch) kept += colonMatch[0];
            t.textContent = kept;
          }
          charCount += txt.length;
        }
      }
      break;
    }
  }

  // Find the next section header after this one (keyword must be near start of paragraph)
  let nextSectionIdx = paragraphs.length;
  for (let i = sectionIdx + 1; i < paragraphs.length; i++) {
    const text = getParagraphText(paragraphs[i]).trim();
    if (text.length > 0 && isSectionHeaderParagraph(text)) {
      nextSectionIdx = i;
      break;
    }
  }

  // Search for the best formatting reference from content paragraphs in this section
  const { pPr: contentPPr, rPr: contentRPr } = findBestFormattingReference(
    paragraphs, sectionIdx + 1, nextSectionIdx, doc
  );

  // Remove existing content paragraphs
  const toRemove: Element[] = [];
  for (let i = sectionIdx + 1; i < nextSectionIdx; i++) {
    toRemove.push(paragraphs[i]);
  }
  toRemove.forEach(p => {
    if (p.parentNode) p.parentNode.removeChild(p);
  });

  // Insert new content after the section header
  const sectionHeader = paragraphs[sectionIdx];
  let insertBefore = sectionHeader.nextSibling;

  const lines = newContent.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const newP = createTextParagraph(doc, line, contentPPr, contentRPr, bold);
    body.insertBefore(newP, insertBefore);
  }
}

export async function modifyTemplate(templateBlob: Blob, study: StudyData): Promise<Blob> {
  const zip = await JSZip.loadAsync(templateBlob);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('No se encontró document.xml en la plantilla');

  const docXml = await docXmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, 'application/xml');

  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('No se encontró el body del documento');

  // 1. Add patient name at the very top of the document
  const allParagraphs = Array.from(body.getElementsByTagName('w:p'));
  const firstParagraph = allParagraphs[0];
  const patientParagraph = createTextParagraph(doc, study.nombre_paciente, null);
  body.insertBefore(patientParagraph, body.firstChild);

  // 2. Add specific body part and laterality to the study title if applicable
  const musculoRegions = ['hombro', 'tobillo', 'mano', 'pie', 'cadera', 'pierna', 'brazo', 'rodilla'];
  const isMusculoRegion = musculoRegions.some(r => study.region.toLowerCase().includes(r));
  const cleanLateralidad = (study.lateralidad && study.lateralidad.toLowerCase() !== 'null') ? study.lateralidad.toUpperCase() : null;

  // Build title suffix: only add region if not already in the title, always add laterality if present
  if (isMusculoRegion || cleanLateralidad) {
    const updatedParagraphs = Array.from(body.getElementsByTagName('w:p'));
    for (let i = 0; i < Math.min(10, updatedParagraphs.length); i++) {
      const text = getParagraphText(updatedParagraphs[i]).toLowerCase();
      if (
        text.includes('tac') ||
        text.includes('resonancia') ||
        text.includes('rm ') ||
        text.includes('rm\n') ||
        text.includes('tomografía') ||
        text.includes('tomografia')
      ) {
        // Check if region already exists in the title to avoid duplication
        const regionWords = (study.region || '').toLowerCase()
          .replace(/derech[ao]/g, '').replace(/izquierd[ao]/g, '')
          .replace(/bilateral/g, '').trim()
          .split(/\s+/).filter(w => w.length > 2);
        const regionAlreadyInTitle = isMusculoRegion && regionWords.length > 0
          ? regionWords.every(word => text.includes(word))
          : true;

        const parts: string[] = [];
        if (isMusculoRegion && !regionAlreadyInTitle) {
          parts.push(study.region.toUpperCase());
        }
        if (cleanLateralidad && !text.includes(cleanLateralidad.toLowerCase())) {
  parts.push(cleanLateralidad);
}

        if (parts.length > 0) {
          const suffix = parts.join(' ');
          const runs = updatedParagraphs[i].getElementsByTagName('w:r');
          const lastRun = runs[runs.length - 1];
          if (lastRun) {
            const tElements = lastRun.getElementsByTagName('w:t');
            const lastT = tElements[tElements.length - 1];
            if (lastT) {
              lastT.textContent = (lastT.textContent || '') + ' ' + suffix;
            }
          }
        }
        break;
      }
    }
  }

  // Helper to clean "null" string values
  const clean = (val: string) => (!val || val.toLowerCase() === 'null') ? '' : val;

  // 3. Replace datos clínicos section (replace, these are short clinical data)
  const cleanDatos = clean(study.datos_clinicos);
  if (cleanDatos) {
    replaceSectionContent(body, doc, DATOS_KW, cleanDatos);
  }

 // 4. Replace conclusiones section (replace with transcription conclusions, BOLD + UPPERCASE)
  const cleanConclusiones = clean(study.conclusiones);
  if (cleanConclusiones) {
    replaceSectionContent(body, doc, CONCLUSIONES_KW, cleanConclusiones.toUpperCase(), true);
  }

  // 5. Hallazgos: INSERT new content BEFORE existing template content (preserve original)
  const cleanHallazgos = clean(study.hallazgos);
  if (cleanHallazgos) {
    insertBeforeExistingContent(body, doc, HALLAZGOS_KW, cleanHallazgos);
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  const modifiedXml = serializer.serializeToString(doc);

  // Update the ZIP
  zip.file('word/document.xml', modifiedXml);

  // Generate the modified DOCX
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
