import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;

// ============ SHEET CONFIG ============
const NUM_ROWS = 20;
const NUM_COLS = 6;  // A-F
const COLS = Array.from({ length: NUM_COLS }, (_, i) => String.fromCharCode(65 + i));

// ============ BUILD THE SHEET ============
const sheet = document.getElementById('sheet');

// Header row
let header = '<tr><th class="row-header"></th>';
COLS.forEach(c => header += `<th>${c}</th>`);
header += '</tr>';
sheet.innerHTML = header;

// Data rows
for (let r = 1; r <= NUM_ROWS; r++) {
  let row = `<tr><td class="row-header">${r}</td>`;
  COLS.forEach(c => {
    row += `<td><input id="cell-${c}${r}" type="text"></td>`;
  });
  row += '</tr>';
  sheet.insertAdjacentHTML('beforeend', row);
}

// ============ CELL HELPERS ============
function getCell(col, row) {
  const el = document.getElementById(`cell-${col}${row}`);
  return el ? el.value : '';
}
function setCell(col, row, value) {
  const el = document.getElementById(`cell-${col}${row}`);
  if (el) el.value = value;
}

// ============ STATUS HELPER ============
const statusEl = document.getElementById('status');
function setStatus(msg) { statusEl.textContent = msg; }

// ============ LOAD AI MODEL ============
let ai;
setStatus('⏳ Downloading AI model (~250MB)...');
try {
  ai = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
        setStatus(`⏳ Loading model: ${Math.round(p.progress || 0)}%`);
      }
    }
  });
  setStatus('✅ AI ready!');
  ['btnTranslate', 'btnSummarize', 'btnGrammar', 'btnSentiment', 'btnRunCmd']
    .forEach(id => document.getElementById(id).disabled = false);
} catch (err) {
  setStatus('❌ AI failed to load: ' + err.message);
  console.error(err);
}

// ============ CORE: APPLY AI TO A COLUMN ============
async function processColumn(fromCol, toCol, makePrompt, label) {
  fromCol = fromCol.toUpperCase();
  toCol = toCol.toUpperCase();
  if (!COLS.includes(fromCol) || !COLS.includes(toCol)) {
    setStatus(`❌ Invalid columns. Use A-${COLS[COLS.length - 1]}`);
    return;
  }

  let count = 0;
  for (let r = 1; r <= NUM_ROWS; r++) {
    const text = getCell(fromCol, r).trim();
    if (!text) continue;

    setStatus(`${label}: row ${r}...`);
    setCell(toCol, r, '...');
    try {
      const out = await ai(makePrompt(text), { max_new_tokens: 120, temperature: 0.3 });
      setCell(toCol, r, out[0].generated_text);
      count++;
    } catch (e) {
      setCell(toCol, r, '⚠️ error');
    }
  }
  setStatus(`✅ ${label} done (${count} cells)`);
}

// ============ BUTTON ACTIONS ============
document.getElementById('btnTranslate').onclick = () => {
  const lang = document.getElementById('lang').value;
  processColumn(
    document.getElementById('fromCol').value,
    document.getElementById('toCol').value,
    (text) => `Translate the following text to ${lang}: ${text}`,
    `Translate→${lang}`
  );
};

document.getElementById('btnSummarize').onclick = () => {
  processColumn(
    document.getElementById('fromCol').value,
    document.getElementById('toCol').value,
    (text) => `Summarize in one short sentence: ${text}`,
    'Summarize'
  );
};

document.getElementById('btnGrammar').onclick = () => {
  processColumn(
    document.getElementById('fromCol').value,
    document.getElementById('toCol').value,
    (text) => `Fix the grammar and spelling: ${text}`,
    'Grammar'
  );
};

document.getElementById('btnSentiment').onclick = () => {
  processColumn(
    document.getElementById('fromCol').value,
    document.getElementById('toCol').value,
    (text) => `Is the sentiment of this text positive, negative, or neutral? Answer with one word. Text: ${text}`,
    'Sentiment'
  );
};

document.getElementById('btnClear').onclick = () => {
  if (!confirm('Clear all cells?')) return;
  COLS.forEach(c => {
    for (let r = 1; r <= NUM_ROWS; r++) setCell(c, r, '');
  });
  setStatus('Sheet cleared');
};

// ============ COMMAND PARSER ============
function parseCommand(cmd) {
  cmd = cmd.toLowerCase().trim();

  // translate X to Y [in LANGUAGE]
  let m = cmd.match(/^translate\s+(\w)\s+to\s+(\w)(?:\s+in\s+(\w+))?/);
  if (m) {
    const lang = m[3] ? m[3].charAt(0).toUpperCase() + m[3].slice(1) : 'Spanish';
    return {
      from: m[1], to: m[2],
      prompt: (t) => `Translate to ${lang}: ${t}`,
      label: `Translate→${lang}`
    };
  }

  // summarize X to Y
  m = cmd.match(/^summari[sz]e\s+(\w)\s+to\s+(\w)/);
  if (m) return {
    from: m[1], to: m[2],
    prompt: (t) => `Summarize in one short sentence: ${t}`,
    label: 'Summarize'
  };

  // grammar X to Y
  m = cmd.match(/^(?:grammar|fix)\s+(\w)\s+to\s+(\w)/);
  if (m) return {
    from: m[1], to: m[2],
    prompt: (t) => `Fix the grammar and spelling: ${t}`,
    label: 'Grammar'
  };

  // sentiment X to Y
  m = cmd.match(/^sentiment\s+(\w)\s+to\s+(\w)/);
  if (m) return {
    from: m[1], to: m[2],
    prompt: (t) => `Is this positive, negative, or neutral? One word answer. Text: ${t}`,
    label: 'Sentiment'
  };

  return null;
}

document.getElementById('btnRunCmd').onclick = runCommand;
document.getElementById('commandBox').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runCommand();
});

async function runCommand() {
  const cmd = document.getElementById('commandBox').value.trim();
  if (!cmd) return;
  const parsed = parseCommand(cmd);
  if (!parsed) {
    setStatus('❌ Unknown command. Try: translate A to B in French');
    return;
  }
  await processColumn(parsed.from, parsed.to, parsed.prompt, parsed.label);
}
