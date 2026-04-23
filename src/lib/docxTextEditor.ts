import JSZip from 'jszip';

export interface ParagraphStyle {
  fontFamily?: string;
  fontSize?: number; // in pt
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  spacingBefore?: number; // in pt
  spacingAfter?: number; // in pt
  lineSpacing?: number; // multiplier (e.g. 1.5)
  isHeader: boolean;
  headingLevel?: number;
}

export interface DocxParagraph {
  index: number;
  text: string;
  isHeader: boolean;
  style: ParagraphStyle;
}

function halfPointsToPt(val: string | null): number | undefined {
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n / 2;
}

function twipsToPt(val: string | null): number | undefined {
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n / 20;
}

function extractParagraphStyle(p: Element): ParagraphStyle {
  const style: ParagraphStyle = { isHeader: false };

  const pPr = p.getElementsByTagName('w:pPr')[0];
  if (pPr) {
    // Alignment
    const jc = pPr.getElementsByTagName('w:jc')[0];
    if (jc) {
      const val = jc.getAttribute('w:val');
      if (val === 'center') style.alignment = 'center';
      else if (val === 'right') style.alignment = 'right';
      else if (val === 'both' || val === 'justify') style.alignment = 'justify';
      else style.alignment = 'left';
    }

    // Spacing
    const spacing = pPr.getElementsByTagName('w:spacing')[0];
    if (spacing) {
      style.spacingBefore = twipsToPt(spacing.getAttribute('w:before'));
      style.spacingAfter = twipsToPt(spacing.getAttribute('w:after'));
      const lineVal = spacing.getAttribute('w:line');
      const lineRule = spacing.getAttribute('w:lineRule');
      if (lineVal) {
        const n = parseInt(lineVal, 10);
        if (!isNaN(n)) {
          if (lineRule === 'exact' || lineRule === 'atLeast') {
            style.lineSpacing = n / 240; // twips to line multiplier approx
          } else {
            style.lineSpacing = n / 240;
          }
        }
      }
    }

    // Heading style
    const pStyle = pPr.getElementsByTagName('w:pStyle')[0];
    if (pStyle) {
      const styleVal = pStyle.getAttribute('w:val') || '';
      const lower = styleVal.toLowerCase();
      if (lower.includes('heading') || lower.includes('titulo')) {
        style.isHeader = true;
        const match = styleVal.match(/(\d+)/);
        style.headingLevel = match ? parseInt(match[1], 10) : 1;
      }
    }

    // Paragraph-level run properties
    const pRPr = pPr.getElementsByTagName('w:rPr')[0];
    if (pRPr) {
      applyRunProps(pRPr, style);
    }
  }

  // Get formatting from first run with text
  const runs = Array.from(p.getElementsByTagName('w:r'));
  for (const r of runs) {
    const texts = r.getElementsByTagName('w:t');
    if (texts.length > 0 && (texts[0].textContent || '').trim().length > 0) {
      const rPr = r.getElementsByTagName('w:rPr')[0];
      if (rPr) {
        applyRunProps(rPr, style);
      }
      break;
    }
  }

  // Check if all runs are bold (for header detection)
  if (!style.isHeader && runs.length > 0) {
    const allBold = runs.every(r => {
      const rPr = r.getElementsByTagName('w:rPr')[0];
      return rPr && rPr.getElementsByTagName('w:b').length > 0;
    });
    const text = Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent || '').join('');
    if (allBold && text.length < 80) {
      style.isHeader = true;
      style.headingLevel = 3;
    }
  }

  return style;
}

function applyRunProps(rPr: Element, style: ParagraphStyle) {
  // Font
  const rFonts = rPr.getElementsByTagName('w:rFonts')[0];
  if (rFonts) {
    style.fontFamily = rFonts.getAttribute('w:ascii') || rFonts.getAttribute('w:hAnsi') || rFonts.getAttribute('w:cs') || undefined;
  }

  // Size
  const sz = rPr.getElementsByTagName('w:sz')[0];
  if (sz) {
    style.fontSize = halfPointsToPt(sz.getAttribute('w:val'));
  }

  // Color
  const color = rPr.getElementsByTagName('w:color')[0];
  if (color) {
    const val = color.getAttribute('w:val');
    if (val && val !== 'auto') {
      style.color = `#${val}`;
    }
  }

  // Bold
  if (rPr.getElementsByTagName('w:b').length > 0) {
    const bEl = rPr.getElementsByTagName('w:b')[0];
    const bVal = bEl.getAttribute('w:val');
    style.bold = bVal !== '0' && bVal !== 'false';
  }

  // Italic
  if (rPr.getElementsByTagName('w:i').length > 0) {
    const iEl = rPr.getElementsByTagName('w:i')[0];
    const iVal = iEl.getAttribute('w:val');
    style.italic = iVal !== '0' && iVal !== 'false';
  }

  // Underline
  if (rPr.getElementsByTagName('w:u').length > 0) {
    const uEl = rPr.getElementsByTagName('w:u')[0];
    const uVal = uEl.getAttribute('w:val');
    style.underline = uVal !== 'none';
  }
}

/**
 * Extract text paragraphs with rich formatting from a .docx blob.
 */
export async function extractDocxParagraphs(blob: Blob): Promise<{
  paragraphs: DocxParagraph[];
  zip: JSZip;
  docXml: string;
}> {
  const zip = await JSZip.loadAsync(blob);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('No se encontró document.xml en la plantilla');

  const docXml = await docXmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, 'application/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('No se encontró el body del documento');

  const wParagraphs = Array.from(body.getElementsByTagName('w:p'));
  const paragraphs: DocxParagraph[] = [];

  for (let i = 0; i < wParagraphs.length; i++) {
    const p = wParagraphs[i];
    const texts = Array.from(p.getElementsByTagName('w:t'));
    const text = texts.map(t => t.textContent || '').join('');
    
    const style = extractParagraphStyle(p);

    // Include empty paragraphs as spacing
    paragraphs.push({ index: i, text, isHeader: style.isHeader, style });
  }

  return { paragraphs, zip, docXml };
}

/**
 * Apply text edits to the docx XML and return a new Blob.
 * editedTexts maps original paragraph index → new text.
 */
export async function applyDocxEdits(
  zip: JSZip,
  docXml: string,
  editedTexts: Map<number, string>
): Promise<Blob> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, 'application/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('No se encontró el body del documento');

  const wParagraphs = Array.from(body.getElementsByTagName('w:p'));

  for (let i = 0; i < wParagraphs.length; i++) {
    if (!editedTexts.has(i)) continue;
    
    const p = wParagraphs[i];
    const texts = Array.from(p.getElementsByTagName('w:t'));
    const originalText = texts.map(t => t.textContent || '').join('');
    const newText = editedTexts.get(i)!;

    if (newText !== originalText && texts.length > 0) {
      texts[0].textContent = newText;
      texts[0].setAttribute('xml:space', 'preserve');
      for (let t = 1; t < texts.length; t++) {
        texts[t].textContent = '';
      }
    }
  }

  const serializer = new XMLSerializer();
  const modifiedXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', modifiedXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
