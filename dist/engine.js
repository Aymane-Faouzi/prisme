(() => {
  'use strict';

  const numberPattern = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  const functions = new Set(['sin', 'cos', 'tan', 'sqrt', 'log']);

  function calculate(tokens, angle = 'DEG') {
    let cursor = 0;

    function requireClosingParenthesis() {
      if (tokens[cursor++] !== ')') throw new Error('Fermez la parenthèse.');
    }

    function applyFunction(name, value) {
      if (name === 'sqrt') {
        if (value < 0) throw new Error('La racine carrée exige un nombre positif ou nul.');
        return Math.sqrt(value);
      }
      if (name === 'log') {
        if (value <= 0) throw new Error('Le logarithme exige un nombre strictement positif.');
        return Math.log10(value);
      }
      const radians = angle === 'DEG' ? (value % 360) * Math.PI / 180 : value;
      const cosine = Math.cos(radians);
      if (name === 'tan' && Math.abs(cosine) < Number.EPSILON) throw new Error('Tangente indéfinie pour cet angle.');
      const result = Math[name](radians);
      return Math.abs(result) < Number.EPSILON && Math.abs(radians) >= 1 ? 0 : result;
    }

    function readOperand() {
      const token = tokens[cursor++];
      if (token === '-') {
        const operand = readExpression(3);
        return { value: -operand.value, percent: operand.percent };
      }
      let value;
      if (token === '(') {
        const nested = readExpression(1);
        requireClosingParenthesis();
        return nested;
      }
      if (functions.has(token)) {
        if (tokens[cursor++] !== '(') throw new Error('Ouvrez une parenthèse.');
        value = readExpression(1).value;
        requireClosingParenthesis();
        return { value: applyFunction(token, value), percent: false };
      }
      if (token === 'π') return { value: Math.PI, percent: false };
      if (numberPattern.test(token)) return { value: Number(token), percent: false };
      throw new Error('Complétez le calcul.');
    }

    function readExpression(minimum) {
      let left = readOperand();
      while (tokens[cursor] === '%') {
        left = { value: left.value / 100, percent: true };
        cursor++;
      }
      while (precedence[tokens[cursor]] >= minimum) {
        const operator = tokens[cursor++];
        const right = readExpression(precedence[operator] + (operator === '^' ? 0 : 1));
        const relative = right.percent && (operator === '+' || operator === '-');
        const value = relative ? left.value * right.value : right.value;
        let result;
        switch (operator) {
          case '+': result = left.value + value; break;
          case '-': result = left.value - value; break;
          case '*': result = left.value * value; break;
          case '/':
            if (value === 0) throw new Error('Division par zéro impossible.');
            result = left.value / value;
            break;
          case '^': result = left.value ** value; break;
        }
        left = { value: result, percent: false };
      }
      return left;
    }

    const { value } = readExpression(1);
    if (cursor !== tokens.length) throw new Error('Vérifiez les opérateurs et les parenthèses.');
    if (!Number.isFinite(value)) throw new Error('Résultat hors du domaine des nombres réels ou trop grand.');
    return Number(value.toPrecision(15));
  }

  const api = { calculate, functions, numberPattern };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.PrismEngine = api;
})();
