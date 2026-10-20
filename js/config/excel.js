// js/config/excel.js
// Crea un archivo de Excel (.xlsx) de verdad en el navegador, sin librerías.
// Un .xlsx es un ZIP con archivos XML: aquí se arma el ZIP "sin comprimir" (método STORE).
// Uso: descargarExcel('reservas.xlsx', [{ nombre: 'Reservas', columnas: ['Código', 'Monto'], filas: [['COD-1', 28]] }])

const codificador = new TextEncoder();

// CRC-32 (lo exige el formato ZIP para cada archivo)
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos) {
  const partes = [];
  const central = [];
  let desplazamiento = 0;
  for (const { nombre, contenido } of archivos) {
    const nombreBytes = codificador.encode(nombre);
    const datos = codificador.encode(contenido);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true); // sin compresión
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombreBytes.length, true);
    partes.push(new Uint8Array(local.buffer), nombreBytes, datos);

    const cab = new DataView(new ArrayBuffer(46));
    cab.setUint32(0, 0x02014b50, true);
    cab.setUint16(4, 20, true);
    cab.setUint16(6, 20, true);
    cab.setUint32(16, crc, true);
    cab.setUint32(20, datos.length, true);
    cab.setUint32(24, datos.length, true);
    cab.setUint16(28, nombreBytes.length, true);
    cab.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(cab.buffer), nombreBytes);
    desplazamiento += 30 + nombreBytes.length + datos.length;
  }
  const tamanoCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamanoCentral, true);
  fin.setUint32(16, desplazamiento, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const escapar = (texto) => String(texto)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function letraColumna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function celda(valor, ref, estilo = 0) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

function hojaXml({ columnas, filas }) {
  const anchos = columnas.map((titulo, i) => Math.min(60, Math.max(10, String(titulo).length + 2,
    ...filas.slice(0, 200).map((f) => String(f[i] ?? '').length + 2))));
  const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const cabecera = `<row r="1">${columnas.map((t, i) => celda(t, `${letraColumna(i)}1`, 1)).join('')}</row>`;
  const cuerpo = filas.map((fila, r) => `<row r="${r + 2}">${fila.map((v, i) => celda(v, `${letraColumna(i)}${r + 2}`)).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${cols}</cols><sheetData>${cabecera}${cuerpo}</sheetData></worksheet>`;
}

export function crearExcel(hojas) {
  const nombres = hojas.map((h, i) => escapar(String(h.nombre || `Hoja ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + nombres.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      // Estilo 1 = encabezado en negrita con fondo celeste
      nombre: 'xl/styles.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE8F5"/></patternFill></fill></fills>'
        + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h) })),
  ];
  return zip(archivos);
}

export function descargarExcel(nombreArchivo, hojas) {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(crearExcel(hojas));
  enlace.download = nombreArchivo;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 2000);
}
