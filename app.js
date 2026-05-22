import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels = false;

// ============ LANGUAGE CODE → NAME ============
const LANG_NAMES = {
  EN: 'English', IT: 'Italian', ES: 'Spanish',
  FR: 'French', DE: 'German',  PT: 'Portuguese', NL: 'Dutch'
};

// ============ DOM REFS ============
const sheetTable = document.getElementById('sheet');
const statusEl = document.getElementById('status');
const setStatus = (m) => statusEl.textContent = m;

let stopRequested = false;
let isRunning = false;

// ============ CELL HELPERS ============
// Row layout: 0 = letters, 1 = language selectors, 2..N = data
// cells: 0 = row number, 1..N = data (col A = cells[1])

function dataRowCount() {
  return sheetTable.rows.length - 2;
}

function getCellText(colIndex, dataRow) {
  // colIndex: 0-25 (A-Z), dataRow: 1-based
  const tr = sheetTable.rows[dataRow + 1]; // +1 skips letters & selector rows... wait
  // Actually rows[0]=letters, rows[1]=selectors, rows[2]=data row 1
  const tr2 = sheetTable.rows[dataRow + 1];
  if (!tr2) return '';
  const td = tr2.cells[colIndex + 1];
  return td ? td.innerText.trim() : '';
}

function setCellText(colIndex, dataRow, value) {
  const tr = sheetTable.rows[dataRow + 1];
  if (!tr) return;
  const td = tr.cells[colIndex + 1];
  if (td) td.innerText = value;
}

function markCell(colIndex, dataRow, on) {
  const tr = sheetTable.rows[dataRow + 1];
  if (!tr) return;
  const td = tr.cells[colIndex + 1];
  if (td) td.classList.toggle('processing', on);
}

// Get the language selected for a given column (returns 'EN', 'ES', 'Off', etc.)
function getColumnLang(colIndex) {
  const selRow = sheetTable.rows[1]; // selectors row
  if (!selRow) return 'Off';
  const th = selRow.cells[colIndex + 1];
  if (!th) return 'Off';
  const sel = th.querySelector('select');
  return sel ? sel.value : 'Off';
}

// ============ LOAD AI ============
let ai;
setStatus('⏳ Downloading model (~250MB, cached after)...');
try {
  ai = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
        setStatus(`⏳ Loading: ${Math.round(p.progress || 0)}%`);
      }
    }
  });
  setStatus('✅ AI ready');
  ['btnTranslate','btnSummarize','btnGrammar','btnSentiment']
    .forEach(id => document.getElementById(id).disabled = false);
} catch (err) {
  setStatus('❌ AI failed: ' + err.message);
}

// ============ CORE PROCESSOR ============
async function processColumn(fromColIdx, toColIdx, makePrompt, label) {
  if (isRunning) { setStatus('⚠️ Already running'); return; }
  if (fromColIdx === toColIdx) {
    if (!confirm('FROM and TO are the same column — overwrite originals?')) return;
  }

  // Collect non-empty cells
  const tasks = [];
  const total = dataRowCount();
  for (let r = 1; r <= total; r++) {
    const t = getCellText(fromColIdx, r);
    if (t) tasks.push({ row: r, text: t });
  }

  if (!tasks.length) {
    setStatus(`⚠️ Column ${String.fromCharCode(65+fromColIdx)} is empty`);
    return;
  }

  isRunning = true;
  stopRequested = false;
  document.getElementById('btnStop').style.display = 'inline-block';

  let done = 0;
  for (const t of tasks) {
    if (stopRequested) { setStatus(`⏹ Stopped at ${done}/${tasks.length}`); break; }
    markCell(toColIdx, t.row, true);
    setCellText(toColIdx, t.row, '...');
    setStatus(`${label}: ${done + 1}/${tasks.length} (row ${t.row})`);
    try {
      const out = await ai(makePrompt(t.text), {
        max_new_tokens: 120,
        temperature: 0.1,
        do_sample: false
      });
      setCellText(toColIdx, t.row, (out[0].generated_text || '').trim() || '(empty)');
    } catch (e) {
      setCellText(toColIdx, t.row, '⚠️ ' + e.message);
    }
    markCell(toColIdx, t.row, false);
    done++;
  }
  if (!stopRequested) setStatus(`✅ ${label} done — ${done} cells`);
  isRunning = false;
  document.getElementById('btnStop').style.display = 'none';
}

document.getElementById('btnStop').onclick = () => { stopRequested = true; };

// ============ TRANSLATE (uses column language selectors!) ============
document.getElementById('btnTranslate').onclick = () => {
  const fromIdx = parseInt(document.getElementById('fromCol').value);
  const toIdx   = parseInt(document.getElementById('toCol').value);
  const fromCode = getColumnLang(fromIdx);
  const toCode   = getColumnLang(toIdx);

  if (fromCode === 'Off' || toCode === 'Off') {
    setStatus('❌ Set language on both columns (the dropdown row at top)');
    alert(`Both columns must have a language set in row 2.\nColumn ${String.fromCharCode(65+fromIdx)}: ${fromCode}\nColumn ${String.fromCharCode(65+toIdx)}: ${toCode}`);
    return;
  }
  if (fromCode === toCode) {
    setStatus('⚠️ Both columns set to the same language');
    return;
  }

  const fromLang = LANG_NAMES[fromCode];
  const toLang   = LANG_NAMES[toCode];

  const makePrompt = (text) =>
    `Translate this ${fromLang} text to ${toLang}. Only output the translation, nothing else.\n${fromLang}: "${text}"\n${toLang}:`;

  processColumn(fromIdx, toIdx, makePrompt, `${fromCode}→${toCode}`);
};

// ============ OTHER TOOLS ============
function getToolCols() {
  return {
    from: parseInt(document.getElementById('toolFrom').value),
    to:   parseInt(document.getElementById('toolTo').value)
  };
}

document.getElementById('btnSummarize').onclick = () => {
  const { from, to } = getToolCols();
  processColumn(from, to,
    (t) => `Summarize in one short sentence: ${t}`, 'Summarize');
};

document.getElementById('btnGrammar').onclick = () => {
  const { from, to } = getToolCols();
  processColumn(from, to,
    (t) => `Correct grammar and spelling. Only output the corrected text: ${t}`, 'Grammar');
};

document.getElementById('btnSentiment').onclick = () => {
  const { from, to } = getToolCols();
  processColumn(from, to,
    (t) => `Classify the sentiment as positive, negative, or neutral. One word only. Text: ${t}`, 'Sentiment');
};

document.getElementById('btnUpper').onclick = () => {
  const { from, to } = getToolCols();
  const total = dataRowCount();
  for (let r = 1; r <= total; r++) {
    const t = getCellText(from, r);
    if (t) setCellText(to, r, t.toUpperCase());
  }
  setStatus('✅ Uppercased');
};
document.getElementById('btnLower').onclick = () => {
  const { from, to } = getToolCols();
  const total = dataRowCount();
  for (let r = 1; r <= total; r++) {
    const t = getCellText(from, r);
    if (t) setCellText(to, r, t.toLowerCase());
  }
  setStatus('✅ Lowercased');
};

// ============ UTILITIES ============
document.getElementById('btnClear').onclick = () => {
  if (!confirm('Clear all cells?')) return;
  const total = dataRowCount();
  for (let c = 0; c < 26; c++)
    for (let r = 1; r <= total; r++) setCellText(c, r, '');
  setStatus('Sheet cleared');
};

document.getElementById('btnSample').onclick = () => {
  const samples = [
    'Hola, ¿cómo estás hoy?',
    'El clima está hermoso.',
    'Me encanta comer pizza.',
    '¿Dónde está la biblioteca?',
    'Mi gato está durmiendo en el sofá.',
    '¿Puedes ayudarme por favor?',
    'Mañana será un gran día.',
    'Ella lee libros cada noche.'
  ];
  samples.forEach((s, i) => setCellText(0, i + 1, s));
  // Auto-set column A to ES and column B to EN
  const selRow = sheetTable.rows[1];
  selRow.cells[1].querySelector('select').value = 'ES';
  selRow.cells[2].querySelector('select').value = 'EN';
  setStatus('✅ Loaded Spanish samples in A. Column A=ES, B=EN. Click Translate!');
};
