<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI Spreadsheet</title>
<link rel="icon" href="data:,">
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, Arial; margin: 0; padding: 15px; background: #0f172a; color: #e2e8f0; }
  h1 { margin: 0 0 12px 0; text-align: center; }

  .panel { background: #1e293b; padding: 10px 12px; border-radius: 10px; margin-bottom: 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  label { font-size: 13px; }
  select, input[type=text], input[type=number], textarea {
    padding: 6px 10px; border-radius: 6px; border: 1px solid #475569;
    background: #0f172a; color: #e2e8f0; font-size: 14px;
  }
  textarea { width: 100%; min-height: 80px; font-family: monospace; }
  button {
    padding: 7px 13px; border-radius: 6px; border: none;
    background: #2563eb; color: white; cursor: pointer; font-size: 14px;
  }
  button:hover:not(:disabled) { background: #1d4ed8; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.alt { background: #475569; }
  button.danger { background: #dc2626; }

  #status {
    margin-left: auto; font-size: 13px; color: #fbbf24;
    padding: 6px 12px; background: #0f172a; border-radius: 6px;
    border: 1px solid #334155; min-width: 220px; text-align: center;
  }

  #sheetWrap { overflow: auto; background: #1e293b; border-radius: 10px; padding: 5px; max-height: 65vh; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #334155; padding: 0; min-width: 110px; height: 28px; font-size: 13px; }
  th { background: #334155; text-align: center; font-weight: 600; }
  th.row-head { background: #334155; min-width: 36px; width: 36px; text-align: center; }
  td { background: #0f172a; padding: 4px 6px; color: #e2e8f0; outline: none; vertical-align: top; }
  td:focus { background: #0c4a6e; outline: 2px solid #2563eb; }
  td.processing { background: #78350f !important; }
  .col-select {
    width: 100%; padding: 2px; font-size: 11px; background: #1e293b;
    color: #e2e8f0; border: 1px solid #475569; border-radius: 4px;
  }

  details { background:#1e293b; padding: 8px 12px; border-radius:8px; margin-bottom: 10px; }
  summary { cursor:pointer; font-weight: 600; }
  .hint { font-size: 12px; color: #94a3b8; margin-top: 6px; }
</style>
</head>
<body>

<h1>📊 AI Spreadsheet</h1>

<!-- AI TOOLBAR -->
<div class="panel">
  <div class="row">
    <b>🌍 Translate:</b>
    <label>From col</label>
    <select id="fromCol"></select>
    <span>→</span>
    <label>To col</label>
    <select id="toCol"></select>
    <button id="btnTranslate" disabled>Translate ▶</button>
    <span class="hint">(reads language from each column's selector row)</span>
    <span id="status">⏳ Loading AI...</span>
  </div>
</div>

<div class="panel">
  <div class="row">
    <b>🛠️ Tools:</b>
    <label>From</label>
    <select id="toolFrom"></select>
    <label>→ To</label>
    <select id="toolTo"></select>
    <button id="btnSummarize" disabled>📝 Summarize</button>
    <button id="btnGrammar" disabled>✍️ Grammar</button>
    <button id="btnSentiment" disabled>😊 Sentiment</button>
    <button id="btnUpper" class="alt">UPPER</button>
    <button id="btnLower" class="alt">lower</button>
    <button id="btnStop" class="danger" style="display:none">⏹ Stop</button>
  </div>
</div>

<!-- UPLOAD / UTILITIES -->
<details>
  <summary>📥 Upload data / 🗑️ Clear</summary>
  <div class="row" style="margin-top:8px;">
    <button onclick="toggleUpload()">Paste column data</button>
    <button id="btnSample" class="alt">Load sample (Spanish in A)</button>
    <button id="btnClear" class="danger">Clear sheet</button>
  </div>
  <div id="uploadBox" style="display:none; margin-top:10px;">
    <label>Paste lines (one per row) into column:</label>
    <select id="columnSelect"></select>
    <textarea id="columnData" placeholder="hola&#10;buenos días&#10;el perro come"></textarea>
    <button onclick="uploadColumn()">Upload</button>
  </div>
</details>

<!-- THE SHEET -->
<div id="sheetWrap">
  <table id="sheet"></table>
</div>

<!-- YOUR SHEET SCRIPT (kept intact, minor tweaks for AI dropdown sync) -->
<script>
  const TOTAL_COLS = 26;
  let totalRows = 26;

  const sheetTable = document.getElementById("sheet");
  const colSelectMap = {};
  for (let i = 0; i < 26; i++) colSelectMap[i] = String.fromCharCode(65 + i);

  // Header row (letters)
  let headerRow = "<tr><th></th>";
  for(let c=0; c<TOTAL_COLS; c++) headerRow += `<th>${colSelectMap[c]}</th>`;
  headerRow += "</tr>";

  // Language selector row
  let selRow = "<tr><th></th>";
  for(let c=0; c<TOTAL_COLS; c++) {
    selRow += `<th><select class='col-select'><option>Off</option><option>EN</option><option>IT</option><option>ES</option><option>FR</option><option>DE</option><option>PT</option><option>NL</option></select></th>`;
  }
  selRow += "</tr>";

  const staticCells = Array(TOTAL_COLS).fill('<td contenteditable="true"></td>').join("");

  let bodyHtml = "";
  for(let r=1; r<=totalRows; r++){
    bodyHtml += `<tr><th class="row-head">${r}</th>${staticCells}</tr>`;
  }
  sheetTable.innerHTML = headerRow + selRow + bodyHtml;

  function addNewRows(count) {
    if(count <= 0) return;
    let htmlBuffer = "";
    for(let i=0; i<count; i++){
      totalRows++;
      htmlBuffer += `<tr><th class="row-head">${totalRows}</th>${staticCells}</tr>`;
    }
    sheetTable.insertAdjacentHTML('beforeend', htmlBuffer);
  }

  // Tab navigation
  sheetTable.addEventListener('keydown', (e) => {
    const target = e.target;
    if(target.tagName.toLowerCase() !== 'td') return;
    if(e.key === 'Tab') {
      e.preventDefault();
      const tdIndex = Array.from(target.parentElement.children).indexOf(target);
      const rowIndex = Array.from(sheetTable.querySelectorAll('tr')).indexOf(target.parentElement);
      let nextTd;
      if(tdIndex === TOTAL_COLS) {
        if(rowIndex === sheetTable.rows.length - 1) {
          addNewRows(1);
          const newRow = sheetTable.rows[sheetTable.rows.length - 1];
          nextTd = newRow.cells[1];
        } else {
          nextTd = sheetTable.rows[rowIndex + 1].cells[1];
        }
      } else {
        nextTd = target.nextElementSibling;
      }
      if(nextTd && nextTd.tagName.toLowerCase() === 'td') {
        nextTd.focus();
        placeCaretAtEnd(nextTd);
      }
    }
  });

  function placeCaretAtEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Upload column (paste lines into a column)
  window.uploadColumn = function() {
    const rawText = document.getElementById("columnData").value;
    const colIndexInput = parseInt(document.getElementById("columnSelect").value);
    if(!rawText.trim()) return alert("Please paste some text.");
    const lines = rawText.split(/\r?\n/);
    const currentDataRows = sheetTable.rows.length - 2;
    if(lines.length > currentDataRows) addNewRows(lines.length - currentDataRows);
    const allRows = sheetTable.rows;
    for(let i = 0; i < lines.length; i++) {
      if(allRows[i+2]) {
        const td = allRows[i+2].cells[colIndexInput + 1];
        if(td) td.innerText = lines[i];
      }
    }
    document.getElementById("uploadBox").style.display = "none";
  };

  window.toggleUpload = () => {
    const box = document.getElementById("uploadBox");
    box.style.display = box.style.display === "none" || box.style.display === "" ? "block" : "none";
  };

  // Populate column dropdowns (used by AI + upload)
  function populateColDropdowns() {
    const opts = Array.from({length: TOTAL_COLS}, (_, i) => `<option value="${i}">${colSelectMap[i]}</option>`).join('');
    ['fromCol','toCol','toolFrom','toolTo','columnSelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
    document.getElementById('toCol').value = 1;
    document.getElementById('toolTo').value = 1;
  }
  populateColDropdowns();
</script>

<!-- AI SCRIPT (separate module) -->
<script type="module" src="./app.js"></script>
</body>
</html>
