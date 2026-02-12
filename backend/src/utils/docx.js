const fs = require('fs');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

function normalizeDocxXml(xml) {
  // Merge broken runs to avoid tags like {{ce</w:t></w:r><w:r><w:t>p}}
  return xml.replace(
    /<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>/g,
    ''
  );
}

function hasSplitPlaceholders(xml) {
  return /\{\{[^}]*<\/w:t>\s*<w:t[^>]*>[^}]*\}\}/.test(xml);
}

function formatMergeData(cliente) {
  const dataHoje = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dataHojeBr = `${pad(dataHoje.getDate())}/${pad(dataHoje.getMonth() + 1)}/${dataHoje.getFullYear()}`;

  return {
    ...cliente,
    cliente_nome: cliente.nome || '',
    data_hoje: dataHojeBr,
  };
}

function renderDocxBuffer(templatePath, data) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const documentXml = zip.file('word/document.xml');
  let originalXml = null;
  if (documentXml) {
    originalXml = documentXml.asText();
  }

  const tryRender = (customZip) => {
    const doc = new Docxtemplater(customZip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render(data);
    return doc.getZip().generate({ type: 'nodebuffer' });
  };

  if (originalXml && hasSplitPlaceholders(originalXml)) {
    try {
      const normalized = normalizeDocxXml(originalXml);
      zip.file('word/document.xml', normalized);
      return tryRender(zip);
    } catch (err) {
      // fallback to original if normalization breaks xml
      if (originalXml) {
        zip.file('word/document.xml', originalXml);
      }
      return tryRender(zip);
    }
  }

  return tryRender(zip);
}

async function convertDocxToHtml(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  return result.value || '';
}

function convertDocxToPdf(buffer) {
  // Lazy-load to avoid blocking server startup when LibreOffice is unavailable.
  const libre = require('libreoffice-convert');
  return new Promise((resolve, reject) => {
    libre.convert(buffer, '.pdf', undefined, (err, done) => {
      if (err) return reject(err);
      return resolve(done);
    });
  });
}

module.exports = {
  formatMergeData,
  renderDocxBuffer,
  convertDocxToHtml,
  convertDocxToPdf,
};
