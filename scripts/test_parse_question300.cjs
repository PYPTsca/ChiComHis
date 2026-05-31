const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'docs', 'question300.js');
const raw = fs.readFileSync(file, 'utf8');

const LETTER_A_CHARCODE = 'A'.charCodeAt(0);
const CHAPTER_FIELD_PATTERN = `["']?chapter["']?\\s*:\\s*\\d+`;
const ENTRY_LOOKAHEAD_PATTERN = `(?=\\n\\s*\\{[\\s\\S]*?${CHAPTER_FIELD_PATTERN}|$)`;
const ENTRY_PREFIX_PATTERN = `\\{[\\s\\S]*?${CHAPTER_FIELD_PATTERN}`;
const ENTRY_REGEX = new RegExp(`${ENTRY_PREFIX_PATTERN}[\\s\\S]*?${ENTRY_LOOKAHEAD_PATTERN}`, 'g');
const OPTION_PREFIX_PATTERN = /^([A-Z])[\s.．、)）]+(.+)$/;

function extractEntries(raw) {
	const cleaned = raw.replace(/^\s*\/\/.*$/gm, '');
	const all = cleaned.match(/\{[\s\S]*?\}/g) || [];
	return all.filter((blk) => /["']?chapter["']?\s*:\s*\d+/.test(blk));
}

function matchNumber(block, key) {
	const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = block.match(new RegExp(`["']?${safeKey}["']?\\s*:\\s*(\\d+)`));
	return match ? Number(match[1]) : null;
}

function matchString(block, key) {
	const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = block.match(new RegExp(`["']?${safeKey}["']?\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's'));
	return match ? match[1].trim() : '';
}

function matchArray(block, key) {
	const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = block.match(new RegExp(`["']?${safeKey}["']?\\s*:\\s*\\[(.*?)\\]`, 's'));
	if (!match) return [];
	const items = [];
	const re = /"([^"\\]*?(?:\\\\.[^"\\]*?)*)"/g;
	let m;
	while ((m = re.exec(match[1])) !== null) items.push(m[1].trim());
	return items;
}

function matchAnswer(block) {
	const arrayMatch = block.match(/["']?answer["']?\s*:\s*\[(.*?)\]/s);
	if (arrayMatch) {
		const re = /"([^"\\]*?(?:\\.[^"\\]*?)*)"/g;
		const vals = [];
		let m;
		while ((m = re.exec(arrayMatch[1])) !== null) vals.push(m[1].trim());
		return vals;
	}
	const stringMatch = block.match(/["']?answer["']?\s*:\s*"([^"\\]*?(?:\\.[^"\\]*?)*)"/s);
	if (stringMatch) return stringMatch[1].trim();
	return null;
}

function normalizeType(value) {
	const cleaned = value.replace(/\s+/g, '');
	if (cleaned.includes('单选')) return 'single';
	if (cleaned.includes('多选')) return 'multi';
	if (cleaned.includes('判断')) return 'judge';
	return null;
}

function normalizeOptions(options) {
	const normalized = {};
	options.forEach((option, idx) => {
		const trimmed = option.trim();
		if (!trimmed) return;
		const match = trimmed.match(OPTION_PREFIX_PATTERN);
		const letter = match ? match[1] : String.fromCharCode(LETTER_A_CHARCODE + idx);
		const value = match ? match[2].trim() : trimmed;
		normalized[letter] = value;
	});
	return normalized;
}

function normalizeAnswer(answer, type) {
	const raw = Array.isArray(answer) ? answer.join('') : answer || '';
	const letters = raw.toUpperCase().replace(/[^A-Z]/g, '').split('');
	if (type === 'single' || type === 'judge') return letters[0] || '';
	return [...new Set(letters)];
}

function extractIndex(text, position) {
	const match = text.match(/^\s*(\d+)[.．、]/);
	if (match) return Number(match[1]);
	return position + 1;
}

function parseRawQuestion(block) {
	const chapter = matchNumber(block, 'chapter');
	const type = matchString(block, 'type');
	const question = matchString(block, 'question');
	const options = matchArray(block, 'options');
	const answer = matchAnswer(block);
	const explanation = matchString(block, 'explanation');
	if (chapter === null || !type || !question || options.length === 0 || answer === null) return null;
	return { chapter, type, question, options, answer, explanation };
}

function parseQuestionBank(raw) {
	const entries = extractEntries(raw);
	console.log('extracted blocks:', entries.length);
	if (entries.length > 0) {
		console.log('first block preview:\n', entries[0].slice(0, 400));
	}
	const questions = [];
	entries.forEach((entry, pos) => {
		if (pos === 0) {
			console.log('debug matchNumber chapter ->', matchNumber(entry, 'chapter'));
			console.log('debug matchString type ->', matchString(entry, 'type'));
			console.log('debug matchString question ->', matchString(entry, 'question').slice(0,60));
			console.log('debug matchArray options ->', matchArray(entry, 'options'));
			console.log('debug matchAnswer ->', matchAnswer(entry));
		}
		const r = parseRawQuestion(entry);
		if (!r) return;
		const ntype = normalizeType(r.type);
		if (!ntype) return;
		const text = r.question.trim();
		const index = extractIndex(text, pos);
		const opts = normalizeOptions(r.options);
		const ans = normalizeAnswer(r.answer, ntype);
		const id = `${ntype}-${r.chapter}-${index}`;
		if (Object.keys(opts).length === 0) return;
		questions.push({ id, type: ntype, index, chapter: r.chapter, text, options: opts, answer: ans, explanation: r.explanation || '' });
	});
	return questions;
}

// end helper functions

const parsed = parseQuestionBank(raw);
console.log('parsed count:', parsed.length);
const sample = parsed.slice(0, 5);
console.log('sample:', sample.map(q => ({ id: q.id, type: q.type, answer: q.answer })));