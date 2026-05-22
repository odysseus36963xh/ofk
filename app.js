import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels = false;

// ============ LANGUAGE CODES ============
const NLLB_CODES = {
  EN: 'eng_Latn', ES: 'spa_Latn', IT: 'ita_Latn',
  FR: 'fra_Latn', DE: 'deu_Latn', PT: 'por_Latn', NL: 'nld_Latn'
};

// ============ DOM REFS ============
const sheetTable = document.getElementById('sheet');
const statusEl = document.getElementById('status');
const setStatus = (m) => statusEl.textContent = m;

let stopRequested = false;
let isRunning = false;

// ============ CELL HELPERS ============
function dataRowCount() { return sheetTable.rows.length - 2; }

function getCellText(colIndex, dataRow) {
  const tr = sheetTable.rows[dataRow + 1];
  if (!tr) return '';
  const td = tr.cells[colIndex + 1];
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
function getColumnLang(colIndex) {
  const selRow = sheetTable.rows[1];
  if (!selRow) return 'Off';
  const th = selRow.cells[colIndex + 1];
  if (!th) return 'Off';
  const sel = th.querySelector('select');
  return sel ? sel.value : 'Off';
}

// ============ LOAD BOTH AI MODELS ============
let translator;
let ai;

setStatus('⏳ Loading translator (~600MB, one-time download)...');
try {
  translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
        setStatus(`⏳ Translator: ${Math.round(p.progress || 0)}%`);
      }
    }
  });
  setStatus('✅ Translator ready. Loading general AI...');
  document.getElementById('btnTranslate').disabled = false;

  ai = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
        setStatus(`⏳ General AI: ${Math.round(p.progress || 0)}%`);
      }
    }
  });
  setStatus('✅ All AI ready!');
  ['btnSummarize','btnGrammar','btnSentiment']
    .forEach(id => document.getElementById(id).disabled = false);

} catch (err) {
  setStatus('❌ Failed: ' + err.message);
  console.error(err);
}

// ============ TRANSLATE (uses NLLB) ============
document.getElementById('btnTranslate').onclick = async () => {
  const fromIdx = parseInt(document.getElementById('fromCol').value);
  const toIdx   = parseInt(document.getElementById('toCol').value);
  const fromCode = getColumnLang(fromIdx);
  const toCode   = getColumnLang(toIdx);

  if (fromCode === 'Off' || toCode === 'Off') {
    alert(`Set language on both columns!\nCol ${String.fromCharCode(65+fromIdx)}: ${fromCode}\nCol ${String.fromCharCode(65+toIdx)}: ${toCode}`);
    return;
  }
  if (fromCode === toCode) { setStatus('⚠️ Same language'); return; }

  const srcLang = NLLB_CODES[fromCode];
  const tgtLang = NLLB_CODES[toCode];
  const label = `${fromCode}→${toCode}`;

  if (isRunning) return;
  if (fromIdx === toIdx && !confirm('Overwrite source column?')) return;

  const tasks = [];
  const total = dataRowCount();
  for (let r = 1; r <= total; r++) {
    const t = getCellText(fromIdx, r);
    if (t) tasks.push({ row: r, text: t });
  }
  if (!tasks.length) { setStatus(`⚠️ Column empty`); return; }

  isRunning = true;
  stopRequested = false;
  document.getElementById('btnStop').style.display = 'inline-block';

  let done = 0;
  for (const t of tasks) {
    if (stopRequested) { setStatus(`⏹ Stopped at ${done}/${tasks.length}`); break; }
    markCell(toIdx, t.row, true);
    setCellText(toIdx, t.row, '...');
    setStatus(`${label}: ${done + 1}/${tasks.length} (row ${t.row})`);
    try {
      const out = await translator(t.text, { src_lang: srcLang, tgt_lang: tgtLang });
      setCellText(toIdx, t.row, (out[0].translation_text || '').trim());
    } catch (e) {
      setCellText(toIdx, t.row, '⚠️ ' + e.message);
    }
    markCell(toIdx, t.row, false);
    done++;
  }
  if (!stopRequested) setStatus(`✅ ${label} done — ${done} cells`);
  isRunning = false;
  document.getElementById('btnStop').style.display = 'none';
};

document.getElementById('btnStop').onclick = () => { stopRequested = true; };

// ============ OTHER TOOLS (use Flan-T5) ============
async function processColumnAI(fromIdx, toIdx, makePrompt, label) {
  if (isRunning) return;
  if (fromIdx === toIdx && !confirm('Overwrite source column?')) return;

  const tasks = [];
  const total = dataRowCount();
  for (let r = 1; r <= total; r++) {
    const t = getCellText(fromIdx, r);
    if (t) tasks.push({ row: r, text: t });
  }
  if (!tasks.length) { setStatus(`⚠️ Column empty`); return; }

  isRunning = true;
  stopRequested = false;
  document.getElementById('btnStop').style.display = 'inline-block';

  let done = 0;
  for (const t of tasks) {
    if (stopRequested) { setStatus(`⏹ Stopped at ${done}/${tasks.length}`); break; }
    markCell(toIdx, t.row, true);
    setCellText(toIdx, t.row, '...');
    setStatus(`${label}: ${done + 1}/${tasks.length} (row ${t.row})`);
    try {
      const out = await ai(makePrompt(t.text), {
        max_new_tokens: 120, temperature: 0.1, do_sample: false
      });
      setCellText(toIdx, t.row, (out[0].generated_text || '').trim() || '(empty)');
    } catch (e) {
      setCellText(toIdx, t.row, '⚠️ ' + e.message);
    }
    markCell(toIdx, t.row, false);
    done++;
  }
  if (!stopRequested) setStatus(`✅ ${label} done — ${done} cells`);
  isRunning = false;
  document.getElementById('btnStop').style.display = 'none';
}

function getToolCols() {
  return {
    from: parseInt(document.getElementById('toolFrom').value),
    to:   parseInt(document.getElementById('toolTo').value)
  };
}

document.getElementById('btnSummarize').onclick = () => {
  const { from, to } = getToolCols();
  processColumnAI(from, to,
    (t) => `Summarize in one short sentence: ${t}`, 'Summarize');
};
document.getElementById('btnGrammar').onclick = () => {
  const { from, to } = getToolCols();
  processColumnAI(from, to,
    (t) => `Correct grammar and spelling. Only output the corrected text: ${t}`, 'Grammar');
};
document.getElementById('btnSentiment').onclick = () => {
  const { from, to } = getToolCols();
  processColumnAI(from, to,
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
  const selRow = sheetTable.rows[1];
  selRow.cells[1].querySelector('select').value = 'ES';
  selRow.cells[2].querySelector('select').value = 'EN';
  setStatus('✅ Spanish samples loaded. A=ES, B=EN. Click Translate!');
};
