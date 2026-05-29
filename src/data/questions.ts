// 原题库（保留以备回滚）
// import questionRaw from '../../docs/question.js?raw'
import questionRaw from '../../docs/question300.js?raw'

export type QuestionType = 'single' | 'multi' | 'judge'

export interface BaseQuestion {
  id: string
  type: QuestionType
  index: number
  chapter: number
  text: string
  options: Record<string, string>
  explanation?: string
}

export interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single'
  answer: string
}

export interface MultiChoiceQuestion extends BaseQuestion {
  type: 'multi'
  answer: string[]
}

export interface JudgeQuestion extends BaseQuestion {
  type: 'judge'
  answer: string
}

export type Question = SingleChoiceQuestion | MultiChoiceQuestion | JudgeQuestion

// const parsedQuestions = parseQuestionBank(questionRaw)
// export const allQuestions: Question[] = parsedQuestions
// export const singleChoiceQuestions = parsedQuestions.filter(isSingleChoice)
// export const multiChoiceQuestions = parsedQuestions.filter(isMultiChoice)

//export const questionById = Object.fromEntries(
//  allQuestions.map((question) => [question.id, question]),
//) as Record<string, Question>

const LETTER_A_CHARCODE = 'A'.charCodeAt(0)
// Matches a chapter field like: chapter: 1 or "chapter": 1
const CHAPTER_FIELD_PATTERN = `["']?chapter["']?\\s*:\\s*\\d+`
// Captures from the opening brace until just before the next chapter entry.
const ENTRY_LOOKAHEAD_PATTERN = `(?=\\n\\s*\\{[\\s\\S]*?${CHAPTER_FIELD_PATTERN}|$)`
const ENTRY_PREFIX_PATTERN = `\\{[\\s\\S]*?${CHAPTER_FIELD_PATTERN}`
const ENTRY_REGEX = new RegExp(`${ENTRY_PREFIX_PATTERN}[\\s\\S]*?${ENTRY_LOOKAHEAD_PATTERN}`, 'g')
// Matches option labels like "A.", "A．", or "A、" followed by text.
const OPTION_PREFIX_PATTERN = /^([A-Z])[\s.．、)）]+(.+)$/

const parsedQuestions = parseQuestionBank(questionRaw);
export const allQuestions: Question[] = parsedQuestions;
export const singleChoiceQuestions = parsedQuestions.filter(isSingleChoice);
export const multiChoiceQuestions = parsedQuestions.filter(isMultiChoice);

export const questionById = Object.fromEntries(
    allQuestions.map((question) => [question.id, question]),
) as Record<string, Question>;

interface RawQuestion {
  chapter: number
  type: string
  question: string
  options: string[]
  answer: string | string[]
  explanation?: string
}

function parseQuestionBank(raw: string): Question[] {
  const entries = extractEntries(raw)
  const questions: Question[] = []

  entries.forEach((entry, position) => {
    const rawQuestion = parseRawQuestion(entry)
    if (!rawQuestion) return
    const normalized = normalizeQuestion(rawQuestion, position)
    if (normalized) {
      questions.push(normalized)
    }
  })

  return questions
}

function extractEntries(raw: string) {
  const cleaned = raw.replace(/^\s*\/\/.*$/gm, '')
  return cleaned.match(ENTRY_REGEX) ?? []
}

function parseRawQuestion(block: string): RawQuestion | null {
  const chapter = matchNumber(block, 'chapter')
  const type = matchString(block, 'type')
  const question = matchString(block, 'question')
  const options = matchArray(block, 'options')
  const answer = matchAnswer(block)
  const explanation = matchString(block, 'explanation')

  if (chapter === null || !type || !question || options.length === 0 || answer === null) {
    return null
  }

  return {
    chapter,
    type,
    question,
    options,
    answer,
    explanation: explanation || undefined,
  }
}

function normalizeQuestion(rawQuestion: RawQuestion, position: number): Question | null {
  const normalizedType = normalizeType(rawQuestion.type)
  if (!normalizedType) return null

  const text = rawQuestion.question.trim()
  const index = extractIndex(text, position)
  const options = normalizeOptions(rawQuestion.options)
  const answer = normalizeAnswer(rawQuestion.answer, normalizedType)
  const id = `${normalizedType}-${rawQuestion.chapter}-${index}`

  if (Object.keys(options).length === 0) return null
  if (typeof answer === 'string' && !answer) return null
  if (Array.isArray(answer) && answer.length === 0) return null

  const base = {
    id,
    type: normalizedType,
    index,
    chapter: rawQuestion.chapter,
    text,
    options,
    explanation: rawQuestion.explanation,
  }

  if (normalizedType === 'single') {
    if (typeof answer !== 'string') return null
    return {
      ...base,
      type: 'single',
      answer,
    }
  }

  if (normalizedType === 'judge') {
    if (typeof answer !== 'string') return null
    return {
      ...base,
      type: 'judge',
      answer,
    }
  }

  if (!Array.isArray(answer)) return null
  return {
    ...base,
    type: 'multi',
    answer,
  }
}

function normalizeType(value: string): QuestionType | null {
  const cleaned = value.replace(/\s+/g, '')
  if (cleaned.includes('单选')) return 'single'
  if (cleaned.includes('多选')) return 'multi'
  if (cleaned.includes('判断') || cleaned.includes('判断题')) return 'judge'
  return null
}

function extractIndex(text: string, position: number) {
  const match = text.match(/^\s*(\d+)[.．、]/)
  if (match) return Number(match[1])
  return position + 1
}

function normalizeOptions(options: string[]) {
  const normalized: Record<string, string> = {}
  options.forEach((option, index) => {
    const trimmed = option.trim()
    if (!trimmed) return
    const match = trimmed.match(OPTION_PREFIX_PATTERN)
    const letter = match ? match[1] : String.fromCharCode(LETTER_A_CHARCODE + index)
    const value = match ? match[2].trim() : trimmed
    if (letter && value) {
      normalized[letter] = value
    }
  })
  return normalized
}

function normalizeAnswer(answer: string | string[], type: QuestionType) {
  const raw = Array.isArray(answer) ? answer.join('') : answer
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '').split('')
  if (type === 'single' || type === 'judge') {
    return letters[0] ?? ''
  }
  return [...new Set(letters)]
}

function matchNumber(block: string, key: string) {
  const safeKey = escapeRegex(key)
  const match = block.match(new RegExp(`["']?${safeKey}["']?\\s*:\\s*(\\d+)`))
  return match ? Number(match[1]) : null
}

function matchString(block: string, key: string) {
  const safeKey = escapeRegex(key)
  const match = block.match(new RegExp(`["']?${safeKey}["']?\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's'))
  return match ? unescapeString(match[1]).trim() : ''
}

function matchArray(block: string, key: string) {
  const safeKey = escapeRegex(key)
  const match = block.match(new RegExp(`["']?${safeKey}["']?\\s*:\\s*\\[(.*?)\\]`, 's'))
  if (!match) return []
  const items: string[] = []
  const re = /"((?:\\.|[^"\\])*)"/g
  for (const m of match[1].matchAll(re)) {
    items.push(unescapeString(m[1]).trim())
  }
  return items.filter(Boolean)
}

function matchAnswer(block: string) {
  const arrayMatch = block.match(/["']?answer["']?\s*:\s*\[(.*?)\]/s)
  if (arrayMatch) {
    const values: string[] = []
    const re = /"((?:\\.|[^"\\])*)"/g
    for (const m of arrayMatch[1].matchAll(re)) {
      values.push(unescapeString(m[1]).trim())
    }
    return values
  }
  const stringMatch = block.match(/["']?answer["']?\s*:\s*"((?:\\.|[^"\\])*)"/s)
  if (stringMatch) return unescapeString(stringMatch[1]).trim()
  return null
}

function unescapeString(s: string) {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isSingleChoice(question: Question): question is SingleChoiceQuestion {
  return question.type === 'single'
}

function isMultiChoice(question: Question): question is MultiChoiceQuestion {
  return question.type === 'multi'
}
