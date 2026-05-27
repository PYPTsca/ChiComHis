import judgeRaw from '../../docs/《中国近现代史纲要》客观题题库（2023版）判断题.md?raw'
import singleRaw from '../../docs/中国近现代史纲要300单选.md?raw'

export type QuestionType = 'single' | 'judge'

export interface SingleChoiceQuestion {
  id: string
  type: 'single'
  index: number
  text: string
  options: Record<string, string>
  answer: 'A' | 'B' | 'C' | 'D'
}

export interface JudgeQuestion {
  id: string
  type: 'judge'
  index: number
  text: string
  answer: boolean
}

export type Question = SingleChoiceQuestion | JudgeQuestion

export const judgeQuestions = parseJudge(judgeRaw)
export const singleChoiceQuestions = parseSingleChoice(singleRaw)
export const allQuestions: Question[] = [...singleChoiceQuestions, ...judgeQuestions]

export const questionById = Object.fromEntries(
  allQuestions.map((question) => [question.id, question]),
) as Record<string, Question>

function parseJudge(raw: string): JudgeQuestion[] {
  const questions: JudgeQuestion[] = []
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(\d+)\.\s*(.+?)\s*(✅|❌)\s*$/)
    if (!match) continue
    const index = Number(match[1])
    const text = match[2].trim()
    const answer = match[3] === '✅'
    questions.push({
      id: `judge-${index}`,
      type: 'judge',
      index,
      text,
      answer,
    })
  }

  return questions
}

function parseSingleChoice(raw: string): SingleChoiceQuestion[] {
  const questions: SingleChoiceQuestion[] = []
  const lines = raw.split(/\r?\n/)
  let inSection = false
  let current:
    | {
        index: number
        text: string
        answer: 'A' | 'B' | 'C' | 'D'
        optionLines: string[]
      }
    | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (!inSection) {
      if (/单选题/.test(trimmed)) {
        inSection = true
      }
      continue
    }

    const indexMatch = trimmed.match(/^(\d+)\.\s*(.+)$/)
    const answerMatch = trimmed.match(/[（(]([A-D])[）)]/)
    if (indexMatch && answerMatch) {
      if (current) {
        const options = extractOptions(current.optionLines)
        questions.push({
          id: `single-${current.index}`,
          type: 'single',
          index: current.index,
          text: current.text,
          options,
          answer: current.answer,
        })
      }
      const index = Number(indexMatch[1])
      const rawText = trimmed.replace(/^\d+\.\s*/, '')
      const text = rawText.replace(/[（(][A-D][）)]/g, '（ ）').trim()
      current = {
        index,
        text,
        answer: answerMatch[1] as 'A' | 'B' | 'C' | 'D',
        optionLines: [],
      }
      continue
    }

    if (current) {
      current.optionLines.push(trimmed)
    }
  }

  if (current) {
    const options = extractOptions(current.optionLines)
    questions.push({
      id: `single-${current.index}`,
      type: 'single',
      index: current.index,
      text: current.text,
      options,
      answer: current.answer,
    })
  }

  return questions
}

function extractOptions(lines: string[]) {
  const options: Record<string, string> = {}
  const merged = lines
    .join(' ')
    .replace(/[·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const matches = [...merged.matchAll(/(?:^|\s)([A-D])\.\s*/g)]
  if (matches.length === 0) return options

  for (let i = 0; i < matches.length; i += 1) {
    const letter = matches[i][1]
    const start = (matches[i].index ?? 0) + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index ?? merged.length : merged.length
    const value = merged.slice(start, end).trim()
    if (letter && value) {
      options[letter] = value
    }
  }

  return options
}
