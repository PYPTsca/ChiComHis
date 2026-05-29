const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '..', 'docs', '中国近现代史纲要题库.md');
const outPath = path.join(__dirname, '..', 'docs', 'question300.js');

const raw = fs.readFileSync(mdPath, 'utf8');
const lines = raw.split(/\r?\n/);

// find judgment section
let i = 0;
while (i < lines.length && !/判断题/.test(lines[i])) i++;
const judgments = [];
if (i < lines.length) {
  i++; // skip heading
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^---/.test(line)) break;
    if (/^\d+\./.test(line)) {
      const m = line.match(/^\s*(\d+)\.\s*(.*?)\s*([✅❌])?\s*$/);
      if (m) {
        const qnum = Number(m[1]);
        let text = m[2].trim();
        const symbol = m[3];
        const answer = symbol === '✅' ? 'A' : 'B';
        judgments.push({ qnum, text, answer });
      }
    }
  }
}

// find single-choice section start
let j = 0;
while (j < lines.length && !/一\.单选题/.test(lines[j])) j++;
if (j === lines.length) {
  j = 0; // fallback: search for "单选题（300题）"
  while (j < lines.length && !/单选题（300题）/.test(lines[j])) j++;
}

const singles = [];
if (j < lines.length) {
  // move to the first question line
  for (let k = j; k < lines.length; k++) {
    const line = lines[k];
    const qmatch = line.match(/^\s*(\d+)\.\s*(.*?)[（\(]([A-Da-d])[）\)]/);
    if (qmatch) {
      const index = Number(qmatch[1]);
      const text = qmatch[2].trim();
      const answer = qmatch[3].toUpperCase();
      // collect following option lines
      const options = [];
      let t = k + 1;
      while (t < lines.length && /^\s*-\s*[A-Z]/.test(lines[t].trim())) {
        const optLine = lines[t].trim();
        const om = optLine.match(/^\s*-\s*([A-Z])[\.．、)）]?\s*(.*)$/);
        if (om) options.push(`${om[1]}. ${om[2].trim()}`);
        t++;
      }
      singles.push({ index, text, options, answer });
    }
  }
}

// limit to first 300 singles
const selectedSingles = singles.slice(0, 300);

function escapeQuotes(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const entries = [];

// add judgment questions first with chapter 0
judgments.forEach((j) => {
  entries.push(
    `    {\n        chapter: 0,\n        type: "判断题",\n        question: "${escapeQuotes(j.qnum + '. ' + j.text)}",\n        options: ["A. 对", "B. 错"],\n        answer: "${j.answer}",\n        explanation: "",\n    },`
  );
});

selectedSingles.forEach((s) => {
  const opts = s.options.length > 0 ? s.options.map((o) => `"${escapeQuotes(o)}"`).join(', ') : '"A. 选项A", "B. 选项B", "C. 选项C", "D. 选项D"';
  entries.push(
    `    {\n        chapter: 0,\n        type: "单选题",\n        question: "${escapeQuotes(s.index + '. ' + s.text)}",\n        options: [${opts}],\n        answer: "${s.answer}",\n        explanation: "",\n    },`
  );
});

const out = `// ===== 自动生成：由 scripts/generate_question300.js 基于 docs/中国近现代史纲要题库.md 生成 =====\nconst questionBank = [\n${entries.join('\n')}\n];\n\nexport default questionBank;\n`;

fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath, 'with', entries.length, 'entries');
