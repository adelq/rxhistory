chrome.runtime.onInstalled.addListener(function() {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        // When a page contains the .trend-value...
        new chrome.declarativeContent.PageStateMatcher({
          css: [".trend-value"]
        })
      ],
      // ... show the page action.
      actions: [new chrome.declarativeContent.ShowPageAction() ]
    }]);
  });
});

chrome.pageAction.onClicked.addListener(function(tab) {
  chrome.tabs.sendMessage(tab.id, "Background page started.", function (response) {
    // receive the HTML from the tab's page and convert it to a DOM Document
    var doc = htmlToDocument(response);
    getSettings(doc);
  });
});

// Get user settings
var longFormat = false;
var getSettings = function(doc) {
  chrome.storage.sync.get(['longFormat'], function(items) {
    if (typeof items.longFormat !== 'undefined') {
      longFormat = items.longFormat;
    }
    main(doc);
  });
}

var htmlToDocument = function(str) {
    // HTML5 <template> allows any element underneath it
    var template = document.createElement("template");
    if (template.content) {
        template.innerHTML = str;
        return template.content;
    }
}

var MAX_SHEET_NAME_LENGTH = 28;

var getDrugNames = function(doc, longformat) {
  var drugEl = doc.querySelectorAll('.condition-table-drug-name-primary, .drug-name-primary');
  var drugs = [];
  var dups = {};
  for (var i = 0, len = drugEl.length; i < len; i++) {
    var drug = drugEl[i].textContent;
    // Drug name is used for sheet name in short format
    // Cleanup required:
    if (!longformat) {
      // Sheet name cannot have special characters
      // Remove any of \ / ? * [ ]
      drug.replace(/[\\\/\?\*\[\]]/gi, '');
      // Sheet name must not exceed 31 characters
      if (drug.length > MAX_SHEET_NAME_LENGTH) {
        drug = drug.substring(0, MAX_SHEET_NAME_LENGTH) + "...";
      }
    }

    if (drug in dups) {
      dups[drug] += 1;
      drug = `${drug} ${dups[drug]}`;
    } else {
      dups[drug] = 1;
    }

    drugs.push(drug);
  }

  // Remove N/A rows
  var rows = doc.querySelectorAll('tbody.table-sortable-row');
  for (i = rows.length - 1; i >= 0; i--) {
    if (rows[i].querySelector('.no-value')) {
      drugs.splice(i, 1);
    }
  }

  return drugs;
}

var getSparklineText = function(doc) {
  var trendEl = doc.querySelectorAll('.trend-value');
  var text = [];
  for (var i = 0, len = trendEl.length; i < len; i++) {
    text.push(trendEl[i].dataset.originalTitle);
  }
  return text;
}

var getDosages = function(doc) {
  var tooltipEl = doc.querySelectorAll('.tooltip-fair-price');
  var dosages = [];
  for (var i = 0, len = tooltipEl.length; i < len; i++) {
    var tooltipText = tooltipEl[i].dataset.originalTitle;
    var dosage = tooltipText.split("Price based on ")[1].split(" (generic")[0]
    dosages.push(dosage);
  }
  return dosages;
}

var buildTable = function(sparkLine, dosage) {
  var map = [["Date", "Price", "Dosage"]];
  var lines = sparkLine.split('<br>')
  for (var i = 0, nlines = lines.length; i < nlines; i++) {
    var line = lines[i].split(': ');
    var date = moment(line[0], "MMM DD 'YY").format("YYYY-MM-DD");
    var price = parseFloat(line[1].substring(1));
    map.push([date, price, dosage]);
  }
  return map;
}

var createWorkbook = function(drugs, sparklines, dosages) {
  var wb = {};
  wb.SheetNames = drugs;
  wb.Sheets = {};

  for (var i = 0, ndrugs = drugs.length; i < ndrugs; i++) {
    var ws = XLSX.utils.aoa_to_sheet(buildTable(sparklines[i], dosages[i]));
    for (var cell in ws) {
      if (ws[cell].t === "n") {
        ws[cell].z = "$0.00";
      }
    }
    wb.Sheets[drugs[i]] = ws;
  }

  return wb;
}

var createLongWorkbook = function(title, drugs, sparklines, dosages) {
  var wb = {};
  wb.SheetNames = [title];
  wb.Sheets = {};

  var mastersheet = [["Drug", "Date", "Price", "Dosage"]];
  for (var i = 0, ndrugs = drugs.length; i < ndrugs; i++) {
    var sparkline = buildTable(sparklines[i], dosages[i]);
    sparkline.shift();
    for (var j = 0, nprices = sparkline.length; j < nprices; j++) {
      sparkline[j].unshift(drugs[i]);
    }
    mastersheet = mastersheet.concat(sparkline);
  }

  var ws = XLSX.utils.aoa_to_sheet(mastersheet);
  for (var cell in ws) {
    if (ws[cell].t === "n") {
      ws[cell].z = "$0.00";
    }
  }

  wb.Sheets[title] = ws;
  return wb;
}

var filename = function(pageTitle) {
  var niceTitle = pageTitle.replace(/\W+/g, '-').toLowerCase();
  return niceTitle + ".xlsx"
}

var s2ab = function(s) {
  var buf = new ArrayBuffer(s.length);
  var view = new Uint8Array(buf);
  for (var i = 0; i != s.length; ++i) {
    view[i] = s.charCodeAt(i) & 0xFF;
  }
  return buf;
}

var main = function(doc) {
  // Create workbook
  var wb;
  var title = doc.querySelector('h1').textContent;
  var drugNames = getDrugNames(doc);
  var sparklines = getSparklineText(doc);
  var dosages = getDosages(doc);
  if (longFormat) {
    wb = createLongWorkbook(title, drugNames, sparklines, dosages);
  } else {
    wb = createWorkbook(drugNames, sparklines, dosages);
  }
  wb.Props = {
    Title: title,
    Author: "Adel Qalieh"
  }
  var wOpts = {
    bookType: 'xlsx',
    bookSST: false,
    type: 'binary'
  }

  // Create and save XLSX
  var wbOut = XLSX.write(wb, wOpts);
  var blobType = {
    type: 'application/octet-stream'
  }
  saveAs(new Blob([s2ab(wbOut)], blobType), filename(title))
}
