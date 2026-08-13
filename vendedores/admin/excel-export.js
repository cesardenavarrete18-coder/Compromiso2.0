(function () {
  "use strict";

  var encoder = new TextEncoder();

  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function columnName(index) {
    var name = "";
    var value = index + 1;
    while (value > 0) {
      value -= 1;
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26);
    }
    return name;
  }

  function uint16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  function uint32(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  }

  function concatBytes(chunks) {
    var length = chunks.reduce(function (total, chunk) { return total + chunk.length; }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    chunks.forEach(function (chunk) {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  var crcTable = (function () {
    var table = new Uint32Array(256);
    var index;
    var step;
    var value;
    for (index = 0; index < 256; index += 1) {
      value = index;
      for (step = 0; step < 8; step += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[index] = value >>> 0;
    }
    return table;
  }());

  function crc32(bytes) {
    var value = 0xffffffff;
    var index;
    for (index = 0; index < bytes.length; index += 1) {
      value = crcTable[(value ^ bytes[index]) & 255] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  function createZip(files) {
    var localParts = [];
    var centralParts = [];
    var offset = 0;

    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = encoder.encode(file.content);
      var checksum = crc32(data);
      var localHeader = concatBytes([
        uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(33),
        uint32(checksum), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0)
      ]);
      var centralHeader = concatBytes([
        uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(33),
        uint32(checksum), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0),
        uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset)
      ]);
      localParts.push(localHeader, name, data);
      centralParts.push(centralHeader, name);
      offset += localHeader.length + name.length + data.length;
    });

    var centralDirectory = concatBytes(centralParts);
    var endRecord = concatBytes([
      uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
      uint32(centralDirectory.length), uint32(offset), uint16(0)
    ]);
    return concatBytes(localParts.concat([centralDirectory, endRecord]));
  }

  function worksheetXml(rows, customWidths) {
    var widths = (customWidths || [28, 18, 14, 20, 26, 20, 24]).slice(0, rows[0].length);
    while (widths.length < rows[0].length) {
      widths.push(20);
    }
    var rowXml = rows.map(function (row, rowIndex) {
      var cells = row.map(function (value, columnIndex) {
        var reference = columnName(columnIndex) + (rowIndex + 1);
        var style = rowIndex === 0 ? 1 : 2;
        return '<c r="' + reference + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
      }).join("");
      return '<row r="' + (rowIndex + 1) + '" ht="' + (rowIndex === 0 ? 24 : 21) + '" customHeight="1">' + cells + '</row>';
    }).join("");
    var columnXml = widths.map(function (width, index) {
      return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>';
    }).join("");
    var lastCell = columnName(rows[0].length - 1) + Math.max(rows.length, 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + lastCell + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="18"/><cols>' + columnXml + '</cols><sheetData>' + rowXml + '</sheetData>' +
      '<autoFilter ref="A1:' + columnName(rows[0].length - 1) + Math.max(rows.length, 1) + '"/>' +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
      '</worksheet>';
  }

  function buildWorkbook(rows, options) {
    if (!Array.isArray(rows) || !rows.length || !rows[0].length) {
      throw new Error("No hay datos para exportar.");
    }
    options = options || {};
    var sheetName = String(options.sheetName || "Precalificaciones").slice(0, 31);
    var files = [
      {
        name: "[Content_Types].xml",
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
      },
      {
        name: "_rels/.rels",
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
      },
      {
        name: "xl/workbook.xml",
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEscape(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
      },
      {
        name: "xl/styles.xml",
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF001E50"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE5EF"/></left><right style="thin"><color rgb="FFDCE5EF"/></right><top style="thin"><color rgb="FFDCE5EF"/></top><bottom style="thin"><color rgb="FFDCE5EF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
      },
      { name: "xl/worksheets/sheet1.xml", content: worksheetXml(rows, options.widths) }
    ];
    return createZip(files);
  }

  window.grupoSurExcel = Object.freeze({ buildWorkbook: buildWorkbook });
}());
