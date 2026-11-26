(() => {
  'use strict';

  const { calculate, functions, numberPattern } = globalThis.PrismEngine;
  const find = (id) => document.getElementById(id);
  const result = find('result');
  const formula = find('formula');
  const copy = find('copy');
  const status = find('status');
  const operators = new Set(['+', '-', '*', '/', '^']);
  const symbols = { '*': '×', '/': '÷', '-': '−', sqrt: '√' };
  const formatter = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 15 });

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`prisme:${key}`)) ?? fallback; }
    catch { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem(`prisme:${key}`, JSON.stringify(value)); }
    catch { return false; }
    return true;
  }

  const storedHistory = load('history', []);
  let history = Array.isArray(storedHistory) ? storedHistory.filter((entry) => entry && typeof entry.expression === 'string' && Number.isFinite(entry.value)).slice(0, 30) : [];
  let mode = load('mode', 'standard');
  let theme = load('theme', 'dark');
  let angle = load('angle', 'DEG');
  let tokens = [];
  let completed = null;
  let error = '';
  let displayed = null;

  function formatNumber(value) {
    const magnitude = Math.abs(value);
    if (magnitude >= 1e15 || (magnitude > 0 && magnitude < 1e-8)) return String(value).replace('.', ',').replaceAll('-', '−');
    return formatter.format(Object.is(value, -0) ? 0 : value).replaceAll('-', '−');
  }

  function pretty(expression) {
    return expression.map((token, index) => {
      if (operators.has(token) && !(token === '-' && (index === 0 || operators.has(expression[index - 1]) || expression[index - 1] === '('))) {
        return ` ${symbols[token] ?? token} `;
      }
      return (symbols[token] ?? token).replace('.', ',').replaceAll('-', '−');
    }).join('');
  }

  function render() {
    displayed = completed?.value ?? null;
    if (!completed && !error && tokens.length) {
      try { displayed = calculate(tokens, angle); }
      catch { /* Incomplete expressions are expected while entering a calculation. */ }
    }
    const last = tokens.at(-1);
    const singleNumber = tokens.length === 1 || (tokens.length === 2 && tokens[0] === '-');
    const typingNumber = !completed && !error && singleNumber && numberPattern.test(last) && !last.includes('e');
    const text = error ? 'Erreur' : typingNumber ? pretty(tokens) : displayed !== null ? formatNumber(displayed) : tokens.length ? '…' : '0';
    formula.textContent = completed ? `${completed.expression} =` : pretty(tokens);
    result.textContent = text;
    result.classList.toggle('compact', text.length > 12);
    result.classList.toggle('error', Boolean(error));
    copy.disabled = Boolean(error) || (tokens.length > 0 && displayed === null);
    status.textContent = error;
  }

  function renderHistory() {
    find('empty').hidden = history.length > 0;
    find('erase').hidden = !history.length;
    find('history-list').replaceChildren(...history.map((entry) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const expression = document.createElement('span');
      const value = document.createElement('strong');
      button.type = 'button';
      button.className = 'history-entry';
      expression.className = 'history-expression';
      value.className = 'history-value';
      expression.textContent = entry.expression;
      value.textContent = `= ${formatNumber(entry.value)}`;
      button.append(expression, value);
      button.addEventListener('click', () => {
        completed = entry;
        tokens = [String(entry.value)];
        error = '';
        render();
        status.textContent = 'Résultat repris.';
      });
      item.append(button);
      return item;
    }));
  }

  function persistHistory() {
    const saved = save('history', history);
    document.querySelector('.history-footer').textContent = saved ? 'Enregistré sur cet appareil' : 'Historique disponible pour cette session';
    renderHistory();
  }

  function setMode(next) {
    mode = next === 'scientific' ? 'scientific' : 'standard';
    find('science-keys').hidden = mode !== 'scientific';
    find('standard').setAttribute('aria-pressed', String(mode === 'standard'));
    find('scientific').setAttribute('aria-pressed', String(mode === 'scientific'));
    save('mode', mode);
  }

  function setTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    const button = find('theme');
    button.querySelector('use').setAttribute('href', theme === 'light' ? '#moon' : '#sun');
    button.setAttribute('aria-label', theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair');
    save('theme', theme);
  }

  function setAngle(next) {
    angle = next === 'RAD' ? 'RAD' : 'DEG';
    find('angle').textContent = angle;
    find('angle').setAttribute('aria-label', angle === 'DEG' ? 'Degrés, passer aux radians' : 'Radians, passer aux degrés');
    save('angle', angle);
  }

  function isValue(token) {
    return numberPattern.test(token) || token === 'π' || token === ')' || token === '%';
  }

  function needsValue() {
    return !tokens.length || operators.has(tokens.at(-1)) || tokens.at(-1) === '(';
  }

  function changeSign() {
    let end = tokens.length;
    while (tokens[end - 1] === '%') end--;
    let start = end - 1;
    if (tokens[start] === ')') {
      let depth = 1;
      while (--start >= 0 && depth) {
        if (tokens[start] === ')') depth++;
        if (tokens[start] === '(') depth--;
        if (!depth) break;
      }
      if (functions.has(tokens[start - 1])) start--;
    }
    if (tokens[start]?.startsWith('-') && numberPattern.test(tokens[start].slice(1))) {
      tokens[start] = tokens[start].slice(1);
    } else if (start > 0 && tokens[start - 1] === '-' && !isValue(tokens[start - 2])) {
      tokens.splice(start - 1, 1);
    } else if (needsValue()) {
      const last = tokens.at(-1);
      if (last === '-' && !isValue(tokens.at(-2))) tokens.pop();
      else tokens.push('-');
    } else if (start >= 0) {
      tokens.splice(start, 0, '-');
    }
  }

  function input(key) {
    error = '';
    if (key === 'angle') {
      setAngle(angle === 'DEG' ? 'RAD' : 'DEG');
    } else if (key === 'clear') {
      tokens = [];
      completed = null;
    } else if (key === '=') {
      if (!tokens.length || completed) return;
      try {
        const expression = pretty(tokens);
        completed = { expression, value: calculate(tokens, angle) };
        tokens = [String(completed.value)];
        history = [completed, ...history].slice(0, 30);
        persistHistory();
      } catch (failure) {
        error = failure.message;
      }
    } else {
      if (completed) {
        if (/^[\d.(]$/.test(key) || key === 'π' || functions.has(key)) tokens = [];
        completed = null;
      }

      // Split a saved negative result into the same tokens used during entry.
      if (tokens.length === 1 && tokens[0].startsWith('-') && numberPattern.test(tokens[0].slice(1))) {
        tokens = ['-', tokens[0].slice(1)];
      }
      if (tokens.length >= 128 && !['back', 'sign'].includes(key)) return;
      const last = tokens.at(-1);
      if (key === 'back') {
        if (numberPattern.test(last) && last.length > 1 && !last.includes('e')) tokens[tokens.length - 1] = last.slice(0, -1);
        else {
          tokens.pop();
          if (last === '(' && functions.has(tokens.at(-1))) tokens.pop();
        }
      } else if (key === 'sign') {
        changeSign();
      } else if (/^[\d.]$/.test(key)) {
        if (numberPattern.test(last)) {
          if (last.length < 18 && !last.includes('e') && !(key === '.' && last.includes('.'))) {
            tokens[tokens.length - 1] = last === '0' && key !== '.' ? key : last + key;
          }
        } else {
          if (isValue(last)) tokens.push('*');
          tokens.push(key === '.' ? '0.' : key);
        }
      } else if (operators.has(key)) {
        if (isValue(last) || (key === '-' && (last !== '-' || isValue(tokens.at(-2))))) tokens.push(key);
        else if (operators.has(last) && isValue(tokens.at(-2))) tokens[tokens.length - 1] = key;
      } else if (key === '%' && isValue(last) && last !== '%') {
        tokens.push(key);
      } else if (key === ')' && isValue(last) && tokens.filter((token) => token === '(').length > tokens.filter((token) => token === ')').length) {
        tokens.push(')');
      } else if (key === '(' || key === 'π' || functions.has(key)) {
        if (isValue(last)) tokens.push('*');
        tokens.push(key);
        if (functions.has(key)) tokens.push('(');
      }
    }
    render();
  }

  document.querySelectorAll('[data-key]').forEach((button) => button.addEventListener('click', () => input(button.dataset.key)));
  find('standard').addEventListener('click', () => setMode('standard'));
  find('scientific').addEventListener('click', () => setMode('scientific'));
  find('theme').addEventListener('click', () => setTheme(theme === 'light' ? 'dark' : 'light'));
  find('erase').addEventListener('click', () => {
    history = [];
    persistHistory();
    status.textContent = 'Historique effacé.';
  });
  copy.addEventListener('click', async () => {
    const value = String(displayed ?? 0).replace('.', ',');
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(value);
      status.textContent = 'Résultat copié.';
    } catch {
      status.textContent = 'Copie indisponible. Vous pouvez sélectionner le résultat.';
    }
  });

  const aliases = { Enter: '=', Escape: 'clear', Backspace: 'back', Delete: 'clear', ',': '.', x: '*', X: '*' };
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || (event.key === 'Enter' && event.target instanceof HTMLButtonElement && !event.target.dataset.key)) return;
    const key = aliases[event.key] ?? event.key;
    if (!/^[\d.+*/^%()=π-]$/.test(key) && key !== 'clear' && key !== 'back') return;
    event.preventDefault();
    input(key);
  });

  setTheme(theme);
  setMode(mode);
  setAngle(angle);
  persistHistory();
  render();
})();
