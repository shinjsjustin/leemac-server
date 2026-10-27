// Wraps the existing script: exports also reply with the saved PDF.
// The old doPost must be renamed legacyDoPost before pasting this file.
var EXPORT_ACTIONS = ['exportQuote', 'exportOrder', 'exportInvoice', 'exportPackList', 'exportShipping'];

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return legacyDoPost(e);
  }
  if (EXPORT_ACTIONS.indexOf(body.action) === -1) return legacyDoPost(e);

  try {
    var startedAt = new Date();
    legacyDoPost(e);

    var sheetJobNumber = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange('B5').getValue();
    if (String(sheetJobNumber) !== String(body.jobNumber)) {
      return jsonReply({ ok: false, error: 'Sheet job number ' + sheetJobNumber + ' does not match ' + body.jobNumber });
    }

    var files = DriveApp.searchFiles(
      'mimeType = "application/pdf" and createdDate > "' + startedAt.toISOString() + '"'
    );
    var newest = null;
    while (files.hasNext()) {
      var file = files.next();
      if (!newest || file.getDateCreated() > newest.getDateCreated()) newest = file;
    }
    if (!newest) return jsonReply({ ok: false, error: 'No PDF was created' });

    return jsonReply({
      ok: true,
      jobNumber: String(sheetJobNumber),
      pdfBase64: Utilities.base64Encode(newest.getBlob().getBytes()),
    });
  } catch (err) {
    return jsonReply({ ok: false, error: String(err) });
  }
}

function jsonReply(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
