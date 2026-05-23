// ai-module.js - Natural Language AI for Spreadsheets
// Drop-in module with command interface and lazy loading

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels = false;

export class SpreadsheetAI {
  constructor(tableElement) {
    this.table = tableElement;
    this.translator = null;
    this.ai = null;
    this.isRunning = false;
    this.stopRequested = false;
    this.isLoaded = false;
    
    // UI elements
    this.statusEl = document.getElementById('aiStatus');
    this.progressEl = document.getElementById('aiProgress');
    this.progressFill = document.getElementById('aiProgressFill');
    this.progressText = document.getElementById('aiProgressText');
    this.currentCellEl = document.getElementById('aiCurrentCell');
    this.stopBtn = document.getElementById('aiStop');
    this.commandStatus = document.getElementById('aiCommandStatus');
    
    this.setupActivation();
  }

  setupActivation() {
    const activateBtn = document.getElementById('aiActivate');
    const toggleBtn = document.getElementById('aiToggle');
    const panel = document.getElementById('aiPanel');
    
    activateBtn.onclick = async () => {
      if (this.isLoaded) {
        panel.classList.add('active');
        return;
      }
      
      activateBtn.classList.add('loading');
      activateBtn.textContent = '⏳ Loading AI...';
      
      await this.init();
      
      activateBtn.classList.remove('loading');
      activateBtn.classList.add('loaded');
      activateBtn.textContent = '✅ AI Ready';
      
      setTimeout(() => {
        activateBtn.style.display = 'none';
        toggleBtn.classList.add('active');
        panel.classList.add('active');
      }, 1000);
      
      this.isLoaded = true;
    };
    
    toggleBtn.onclick = () => panel.classList.toggle('active');
    document.getElementById('aiClose').onclick = () => panel.classList.remove('active');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('aiExecute').onclick = () => this.executeCommand();
    
    document.getElementById('aiCommand').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        this.executeCommand();
      }
    });
    
    this.stopBtn.onclick = () => {
      this.stopRequested = true;
      this.progressText.textContent = '⏹ Stopping...';
    };
  }

  async init() {
    try {
      this.setStatus('⏳ Loading translator (600MB, first time only)...');
      
      this.translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {
        progress_callback: (p) => {
          if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
            const pct = Math.round(p.progress || 0);
            this.setStatus(`⏳ Translator: ${pct}%`);
            document.getElementById('aiActivate').textContent = `⏳ ${pct}%`;
          }
        }
      });
      
      this.setStatus('⏳ Loading text AI (200MB)...');
      
      this.ai = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
        progress_callback: (p) => {
          if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
            const pct = Math.round(p.progress || 0);
            this.setStatus(`⏳ Text AI: ${pct}%`);
          }
        }
      });
      
      this.setStatus('✅ AI ready! Type a command above.');
      document.getElementById('aiExecute').disabled = false;
      
    } catch (err) {
      this.setStatus('❌ Failed: ' + err.message);
      document.getElementById('aiActivate').textContent = '❌ Failed';
      console.error(err);
    }
  }

  setStatus(msg) {
    this.statusEl.textContent = msg;
  }

  showProgress(action) {
    this.progressEl.classList.add('active');
    this.progressText.textContent = action;
    this.progressFill.style.width = '0%';
    this.stopBtn.style.display = 'block';
  }

  updateProgress(done, total, cellText, rowNum) {
    const pct = Math.round((done / total) * 100);
    this.progressFill.style.width = pct + '%';
    this.progressText.textContent = `Row ${rowNum} • ${done}/${total} (${pct}%)`;
    this.currentCellEl.textContent = cellText.length > 50 
      ? cellText.substring(0, 50) + '...' 
      : cellText;
  }

  hideProgress() {
    setTimeout(() => {
      this.progressEl.classList.remove('active');
      this.stopBtn.style.display = 'none';
    }, 1500);
  }

  // IMPORTANT: Adjust these to match YOUR table structure
  getCellText(colIndex, rowIndex) {
    const row = this.table.rows[rowIndex];
    if (!row) return '';
    // If your table has row headers in first cell, use colIndex + 1
    // If no row headers, use colIndex
    const cell = row.cells[colIndex]; // ← ADJUST IF NEEDED
    return cell ? cell.textContent.trim() : '';
  }

  setCellText(colIndex, rowIndex, value) {
    const row = this.table.rows[rowIndex];
    if (!row) return;
    const cell = row.cells[colIndex]; // ← ADJUST IF NEEDED
    if (cell) cell.textContent = value;
  }

  markCell(colIndex, rowIndex, processing) {
    const row = this.table.rows[rowIndex];
    if (!row) return;
    const cell = row.cells[colIndex]; // ← ADJUST IF NEEDED
    if (!cell) return;
    
    if (processing) {
      cell.classList.add('cell-processing');
    } else {
      cell.classList.remove('cell-processing');
      cell.classList.add('cell-completed');
      setTimeout(() => cell.classList.remove('cell-completed'), 500);
    }
  }

  parseCommand(command) {
    const cmd = command.toLowerCase().trim();
    
    // Extract column letters
    const columnRegex = /column\s+([a-z])/gi;
    const columns = [];
    let match;
    while ((match = columnRegex.exec(cmd)) !== null) {
      columns.push(match[1].toUpperCase());
    }
    
    // Determine action
    let action = null;
    let targetLang = null;
    
    if (cmd.includes('translate')) {
      action = 'translate';
      
      const languages = {
        'english': 'eng_Latn',
        'spanish': 'spa_Latn',
        'french': 'fra_Latn',
        'german': 'deu_Latn',
        'italian': 'ita_Latn',
        'portuguese': 'por_Latn',
        'dutch': 'nld_Latn'
      };
      
      for (const [lang, code] of Object.entries(languages)) {
        if (cmd.includes(lang)) {
          targetLang = code;
          break;
        }
      }
      
      if (!targetLang) {
        return { error: 'Please specify a language: English, Spanish, French, German, Italian, Portuguese, or Dutch' };
      }
    } else if (cmd.includes('summarize') || cmd.includes('summary')) {
      action = 'summarize';
    } else if (cmd.includes('grammar') || cmd.includes('fix')) {
      action = 'grammar';
    } else if (cmd.includes('sentiment')) {
      action = 'sentiment';
    } else {
      return { error: 'Unknown command. Try: translate, summarize, fix grammar, or sentiment' };
    }
    
    if (columns.length < 2) {
      return { error: 'Please specify source and destination (e.g., "column A to column B")' };
    }
    
    return {
      action,
      fromCol: columns[0].charCodeAt(0) - 65,
      toCol: columns[1].charCodeAt(0) - 65,
      targetLang
    };
  }

  async executeCommand() {
    const commandText = document.getElementById('aiCommand').value.trim();
    if (!commandText) return;
    
    this.commandStatus.classList.add('active');
    this.commandStatus.textContent = '🤔 Understanding command...';
    
    const parsed = this.parseCommand(commandText);
    
    if (parsed.error) {
      this.commandStatus.textContent = '❌ ' + parsed.error;
      return;
    }
    
    const colFrom = String.fromCharCode(65 + parsed.fromCol);
    const colTo = String.fromCharCode(65 + parsed.toCol);
    this.commandStatus.textContent = `✅ Got it! ${parsed.action} from column ${colFrom} → ${colTo}`;
    
    await this.delay(1000);
    
    if (parsed.action === 'translate') {
      await this.translateCommand(parsed.fromCol, parsed.toCol, parsed.targetLang);
    } else {
      await this.processAICommand(parsed.fromCol, parsed.toCol, parsed.action);
    }
  }

  async translateCommand(fromCol, toCol, targetLang) {
    if (this.isRunning) return;

    const sourceLang = 'eng_Latn'; // Auto-detect could be added here
    
    const tasks = [];
    const rowCount = this.table.rows.length;
    
    // Start from row 1 (skip header if you have one, adjust as needed)
    for (let r = 1; r < rowCount; r++) {
      const text = this.getCellText(fromCol, r);
      if (text) tasks.push({ row: r, text });
    }

    if (!tasks.length) {
      this.setStatus('⚠️ No text found in source column');
      return;
    }

    this.isRunning = true;
    this.stopRequested = false;
    this.showProgress(`Translating (${tasks.length} cells)`);

    let done = 0;
    for (const task of tasks) {
      if (this.stopRequested) break;

      this.markCell(toCol, task.row, true);
      this.setCellText(toCol, task.row, '⏳...');
      this.updateProgress(done, tasks.length, task.text, task.row);

      await this.delay(100);

      try {
        const result = await this.translator(task.text, {
          src_lang: sourceLang,
          tgt_lang: targetLang
        });
        this.setCellText(toCol, task.row, result[0].translation_text.trim());
      } catch (err) {
        this.setCellText(toCol, task.row, '⚠️ Error');
      }

      this.markCell(toCol, task.row, false);
      done++;
      await this.delay(50);
    }

    if (!this.stopRequested) {
      this.setStatus(`✅ Translated ${done} cells`);
      this.commandStatus.textContent = `✅ Done! Translated ${done} cells`;
    } else {
      this.setStatus(`⏹ Stopped (${done}/${tasks.length})`);
    }

    this.hideProgress();
    this.isRunning = false;
  }

  async processAICommand(fromCol, toCol, action) {
    if (this.isRunning) return;

    const prompts = {
      summarize: (t) => `Summarize in one short sentence: ${t}`,
      grammar: (t) => `Correct grammar and spelling. Only output the corrected text: ${t}`,
      sentiment: (t) => `Classify the sentiment as positive, negative, or neutral. One word only. Text: ${t}`
    };

    const tasks = [];
    const rowCount = this.table.rows.length;
    
    for (let r = 1; r < rowCount; r++) {
      const text = this.getCellText(fromCol, r);
      if (text) tasks.push({ row: r, text });
    }

    if (!tasks.length) {
      this.setStatus('⚠️ No text to process');
      return;
    }

    this.isRunning = true;
    this.stopRequested = false;
    this.showProgress(`${action} (${tasks.length} cells)`);

    let done = 0;
    for (const task of tasks) {
      if (this.stopRequested) break;

      this.markCell(toCol, task.row, true);
      this.setCellText(toCol, task.row, '⏳...');
      this.updateProgress(done, tasks.length, task.text, task.row);

      await this.delay(100);

      try {
        const result = await this.ai(prompts[action](task.text), {
          max_new_tokens: 120,
          temperature: 0.1,
          do_sample: false
        });
        this.setCellText(toCol, task.row, result[0].generated_text.trim() || '(empty)');
      } catch (err) {
        this.setCellText(toCol, task.row, '⚠️ Error');
      }

      this.markCell(toCol, task.row, false);
      done++;
      await this.delay(50);
    }

    if (!this.stopRequested) {
      this.setStatus(`✅ Processed ${done} cells`);
      this.commandStatus.textContent = `✅ Done! Processed ${done} cells`;
    }

    this.hideProgress();
    this.isRunning = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
