import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

interface GenerateReportOptions {
  nombrePaciente: string;
  tipoInforme: string;
  textoFinal: string;
  templateBlob?: Blob;
}

export async function generateWordDocument({
  nombrePaciente,
  tipoInforme,
  textoFinal,
}: GenerateReportOptions): Promise<Blob> {
  // Parse the text into paragraphs
  const paragraphs = textoFinal.split('\n').filter(p => p.trim());

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: tipoInforme.toUpperCase(),
                bold: true,
                size: 32,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Patient info
          new Paragraph({
            children: [
              new TextRun({
                text: 'Paciente: ',
                bold: true,
                size: 24,
              }),
              new TextRun({
                text: nombrePaciente,
                size: 24,
              }),
            ],
            spacing: { after: 200 },
          }),

          // Date
          new Paragraph({
            children: [
              new TextRun({
                text: 'Fecha: ',
                bold: true,
                size: 24,
              }),
              new TextRun({
                text: new Date().toLocaleDateString('es-LA', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
                size: 24,
              }),
            ],
            spacing: { after: 400 },
          }),

          // Separator
          new Paragraph({
            children: [
              new TextRun({
                text: '─'.repeat(50),
                size: 24,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Content paragraphs - parse <b> tags for bold formatting
          ...paragraphs.flatMap(
            (text) => {
              // Split by <b>...</b> tags to create mixed bold/normal runs
              const parts = text.split(/(<b>.*?<\/b>)/gi);
              const children = parts
                .filter(p => p.length > 0)
                .map(part => {
                  const boldMatch = part.match(/^<b>(.*)<\/b>$/i);
                  if (boldMatch) {
                    return new TextRun({
                      text: boldMatch[1],
                      bold: true,
                      size: 24,
                    });
                  }
                  // Strip any remaining HTML tags
                  return new TextRun({
                    text: part.replace(/<[^>]*>/g, ''),
                    size: 24,
                  });
                });
              return [
                new Paragraph({
                  children,
                  spacing: { after: 200 },
                  alignment: AlignmentType.JUSTIFIED,
                }),
              ];
            }
          ),

          // Footer spacer
          new Paragraph({
            spacing: { before: 600 },
          }),

          // Signature line
          new Paragraph({
            children: [
              new TextRun({
                text: '_________________________',
                size: 24,
              }),
            ],
            alignment: AlignmentType.RIGHT,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Firma',
                size: 20,
                italics: true,
              }),
            ],
            alignment: AlignmentType.RIGHT,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

export function downloadBlob(blob: Blob, fileName: string) {
  saveAs(blob, fileName);
}
