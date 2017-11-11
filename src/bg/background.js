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
    main(doc);
  });
});

var htmlToDocument = function(str) {
    // HTML5 <template> allows any element underneath it
    var template = document.createElement("template");
    if (template.content) {
        template.innerHTML = str;
        return template.content;
    }
}

var MAX_SHEET_NAME_LENGTH = 28;

var getDrugNames = function(doc) {
  var drugEl = doc.querySelectorAll('.condition-table-drug-name-primary, .drug-name-primary');
  var drugs = [];
  var dups = {};
  for (var i = 0, len = drugEl.length; i < len; i++) {
    var drug = drugEl[i].textContent;
    // Drug name is used for sheet name, some cleanup:
    // Sheet name cannot have special characters
    // Remove any of \ / ? * [ ]
    drug.replace(/[\\\/\?\*\[\]]/gi, '');
    // Sheet name must not exceed 31 characters
    if (drug.length > MAX_SHEET_NAME_LENGTH) {
      drug = drug.substring(0, MAX_SHEET_NAME_LENGTH) + "...";
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

var processSparklineText = function(sparkLine) {
  var map = [["Date", "Price"]];
  var lines = sparkLine.split('<br>')
  for (var i = 0, nlines = lines.length; i < nlines; i++) {
    var line = lines[i].split(': ');
    var date = moment(line[0], "MMM DD 'YY").format("YYYY-MM-DD");
    var price = parseFloat(line[1].substring(1));
    map.push([date, price]);
  }
  return map;
}

var createWorkbook = function(drugs, sparklines) {
  var wb = {};
  wb.SheetNames = drugs;
  wb.Sheets = {};

  for (var i = 0, ndrugs = drugs.length; i < ndrugs; i++) {
    var ws = XLSX.utils.aoa_to_sheet(processSparklineText(sparklines[i]));
    for (var cell in ws) {
      if (ws[cell].t === "n") {
        ws[cell].z = "$0.00";
      }
    }
    wb.Sheets[drugs[i]] = ws;
  }

  return wb;
}

var filename = function(doc) {
  var pageTitle = doc.querySelector('h1').textContent;
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
  var wb = createWorkbook(getDrugNames(doc), getSparklineText(doc));
  wb.Props = {
    Title: doc.querySelector('h1').textContent,
    Author: "Adel Qalieh"
  }
  var wOpts = {
    bookType: 'xlsx',
    bookSST: false,
    type: 'binary'
  }
  var wbOut = XLSX.write(wb, wOpts);
  var blobType = {
    type: 'application/octet-stream'
  }
  saveAs(new Blob([s2ab(wbOut)], blobType), filename(doc))
}