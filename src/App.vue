<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    allQuestions,
    multiChoiceQuestions,
    questionById,
    singleChoiceQuestions,
} from "./data/questions";
import type { Question, SingleChoiceQuestion } from "./data/questions";

type Mode = "sequence" | "type" | "random" | "wrong";
type TypeFilter = "all" | "single" | "multi";

const mode = ref<Mode>("sequence");
const typeFilter = ref<TypeFilter>("all");
const randomCount = ref(10);
const excludeAnswered = ref(false);

const sessionQuestions = ref<Question[]>([]);
const sessionStarted = ref(false);
const currentIndex = ref(0);
const selectedAnswer = ref("");
const selectedMultiAnswers = ref<string[]>([]);
const submitted = ref(false);
const lastCorrect = ref<boolean | null>(null);

const validQuestionIds = new Set(allQuestions.map((question) => question.id));
const answeredIds = ref<string[]>(
    filterIds(loadIds("chicomhis:answered"), validQuestionIds),
);
const wrongIds = ref<string[]>(
    filterIds(loadIds("chicomhis:wrong"), validQuestionIds),
);
const wrongCorrectCounts = ref<Record<string, number>>(
    filterCounts(loadCounts("chicomhis:wrong-correct"), validQuestionIds),
);

const totalQuestions = computed(() => allQuestions.length);
const answeredCount = computed(() => answeredIds.value.length);
const wrongCount = computed(() => wrongIds.value.length);

const poolByFilter = computed(() => {
    if (typeFilter.value === "single") {
        return singleChoiceQuestions;
    }
    if (typeFilter.value === "multi") {
        return multiChoiceQuestions;
    }
    return allQuestions;
});

const randomPool = computed(() => {
    if (!excludeAnswered.value) return poolByFilter.value;
    const answeredSet = new Set(answeredIds.value);
    return poolByFilter.value.filter(
        (question) => !answeredSet.has(question.id),
    );
});

const randomMax = computed(() => randomPool.value.length);

const currentQuestion = computed(
    () => sessionQuestions.value[currentIndex.value],
);
const progressLabel = computed(() => {
    if (!sessionStarted.value) return "未开始";
    if (sessionQuestions.value.length === 0) return "暂无题目";
    return `第 ${currentIndex.value + 1} / ${sessionQuestions.value.length} 题`;
});

const optionEntries = computed(() => {
    const question = currentQuestion.value;
    if (!question) return [];
    return Object.entries(question.options).sort((a, b) =>
        a[0].localeCompare(b[0]),
    );
});

const correctAnswerLabel = computed(() => {
    const question = currentQuestion.value;
    if (!question) return "";
    if (question.type === "single") {
        return question.answer;
    }
    return question.answer.join("、");
});

const wrongQuestions = computed(() =>
    wrongIds.value
        .map((id) => questionById[id])
        .filter((question): question is Question => Boolean(question)),
);

const isWrongQuestion = computed(() => {
    const question = currentQuestion.value;
    return question ? wrongIds.value.includes(question.id) : false;
});
const currentWrongCorrectCount = computed(() => {
    const question = currentQuestion.value;
    if (!question) return 0;
    return wrongCorrectCounts.value[question.id] ?? 0;
});
const showPreviouslyWrong = computed(
    () => !submitted.value && mode.value !== "wrong" && isWrongQuestion.value,
);
const showCorrectOnce = computed(
    () =>
        !submitted.value &&
        mode.value === "wrong" &&
        isWrongQuestion.value &&
        currentWrongCorrectCount.value === 1,
);

const canSubmit = computed(() => {
    if (submitted.value) return false;
    const question = currentQuestion.value;
    if (!question) return false;
    if (question.type === "multi") {
        return selectedMultiAnswers.value.length > 0;
    }
    return selectedAnswer.value !== "";
});
const isLastQuestion = computed(
    () =>
        sessionQuestions.value.length > 0 &&
        currentIndex.value >= sessionQuestions.value.length - 1,
);

watch(
    () => mode.value,
    (value) => {
        if (value === "type" && typeFilter.value === "all") {
            typeFilter.value = "single";
        }
        if (value === "wrong") {
            typeFilter.value = "all";
        }
    },
);

watch(
    () => randomMax.value,
    () => clampRandomCount(),
);

watch(
    () => answeredIds.value,
    (value) => saveIds("chicomhis:answered", value),
    { deep: true },
);

watch(
    () => wrongIds.value,
    (value) => saveIds("chicomhis:wrong", value),
    { deep: true },
);

watch(
    () => wrongCorrectCounts.value,
    (value) => saveCounts("chicomhis:wrong-correct", value),
    { deep: true },
);

function startSession() {
    let pool: Question[] = [];

    if (mode.value === "sequence") {
        pool = allQuestions;
    } else if (mode.value === "type") {
        pool = poolByFilter.value;
    } else if (mode.value === "random") {
        clampRandomCount();
        pool = pickRandom(randomPool.value, randomCount.value);
    } else if (mode.value === "wrong") {
        pool = wrongQuestions.value;
    }

    sessionQuestions.value = pool;
    sessionStarted.value = true;
    currentIndex.value = 0;
    resetAnswerState();
}

function submitAnswer() {
    const question = currentQuestion.value;
    if (!question) return;
    if (question.type === "multi" && selectedMultiAnswers.value.length === 0)
        return;
    if (question.type === "single" && !selectedAnswer.value) return;

    const correct =
        question.type === "single"
            ? selectedAnswer.value === question.answer
            : isMultiAnswerCorrect(selectedMultiAnswers.value, question.answer);

    lastCorrect.value = correct;
    submitted.value = true;

    if (!answeredIds.value.includes(question.id)) {
        answeredIds.value = [...answeredIds.value, question.id];
    }
    if (!correct) {
        if (!wrongIds.value.includes(question.id)) {
            wrongIds.value = [...wrongIds.value, question.id];
            if (question.id in wrongCorrectCounts.value) {
                const { [question.id]: _, ...rest } = wrongCorrectCounts.value;
                wrongCorrectCounts.value = rest;
            }
        }
    } else if (wrongIds.value.includes(question.id)) {
        const currentCount = wrongCorrectCounts.value[question.id] ?? 0;
        const nextCount = currentCount + 1;
        if (nextCount >= 2) {
            wrongIds.value = wrongIds.value.filter((id) => id !== question.id);
            const { [question.id]: _, ...rest } = wrongCorrectCounts.value;
            wrongCorrectCounts.value = rest;
        } else {
            wrongCorrectCounts.value = {
                ...wrongCorrectCounts.value,
                [question.id]: nextCount,
            };
        }
    }
}

function nextQuestion() {
    if (isLastQuestion.value) return;
    currentIndex.value += 1;
    resetAnswerState();
}

function restartSession() {
    startSession();
}

function resetAnswerState() {
    selectedAnswer.value = "";
    selectedMultiAnswers.value = [];
    submitted.value = false;
    lastCorrect.value = null;
}

function pickRandom(pool: Question[], count: number) {
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(count, copy.length));
}

function clampRandomCount() {
    if (randomMax.value === 0) {
        randomCount.value = 0;
        return;
    }
    if (!randomCount.value || randomCount.value < 1) {
        randomCount.value = 1;
    }
    if (randomCount.value > randomMax.value) {
        randomCount.value = randomMax.value;
    }
}

function loadIds(key: string) {
    if (typeof localStorage === "undefined") return [];
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === "string");
        }
    } catch {
        return [];
    }
    return [];
}

function saveIds(key: string, value: string[]) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
}

function loadCounts(key: string): Record<string, number> {
    if (typeof localStorage === "undefined") return {};
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return Object.fromEntries(
                Object.entries(parsed).filter(
                    ([, value]) =>
                        typeof value === "number" &&
                        Number.isFinite(value) &&
                        value > 0,
                ),
            ) as Record<string, number>;
        }
    } catch {
        return {};
    }
    return {};
}

function saveCounts(key: string, value: Record<string, number>) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
}

function filterIds(ids: string[], validIds: Set<string>) {
    const seen = new Set<string>();
    return ids.filter((id) => {
        if (!validIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function filterCounts(counts: Record<string, number>, validIds: Set<string>) {
    return Object.fromEntries(
        Object.entries(counts).filter(
            ([id, value]) => validIds.has(id) && value > 0,
        ),
    ) as Record<string, number>;
}

function isMultiAnswerCorrect(selected: string[], answer: string[]) {
    const selectedSet = new Set(selected.map((item) => item.toUpperCase()));
    const answerSet = new Set(answer.map((item) => item.toUpperCase()));
    if (selectedSet.size !== answerSet.size) return false;
    return Array.from(selectedSet).every((item) => answerSet.has(item));
}

function isSingleChoice(question: Question): question is SingleChoiceQuestion {
    return question.type === "single";
}
</script>

<template>
    <div class="page">
        <div class="container">
            <header class="header card">
                <div>
                    <p class="tag">中国近现代史纲要刷题</p>
                    <h1>刷题练习</h1>
                    <p class="subtitle">
                        按顺序、按题型或随机抽题，支持错题本与刷题记录。
                    </p>
                </div>
                <div class="stats">
                    <div class="stat">
                        <span class="stat-label">总题数</span>
                        <span class="stat-value">{{ totalQuestions }}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">已刷</span>
                        <span class="stat-value">{{ answeredCount }}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">错题</span>
                        <span class="stat-value">{{ wrongCount }}</span>
                    </div>
                </div>
            </header>

            <section class="card">
                <div class="controls">
                    <div class="control-group">
                        <span class="control-label">刷题模式</span>
                        <div class="button-group">
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: mode === 'sequence' }"
                                @click="mode = 'sequence'"
                            >
                                按顺序
                            </button>
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: mode === 'type' }"
                                @click="mode = 'type'"
                            >
                                按题型
                            </button>
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: mode === 'random' }"
                                @click="mode = 'random'"
                            >
                                随机抽题
                            </button>
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: mode === 'wrong' }"
                                @click="mode = 'wrong'"
                            >
                                错题本
                            </button>
                        </div>
                    </div>

                    <div v-if="mode === 'type'" class="control-group">
                        <span class="control-label">题目类型</span>
                        <div class="button-group">
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: typeFilter === 'single' }"
                                @click="typeFilter = 'single'"
                            >
                                单选
                            </button>
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: typeFilter === 'multi' }"
                                @click="typeFilter = 'multi'"
                            >
                                多选
                            </button>
                        </div>
                    </div>

                    <div v-if="mode === 'random'" class="control-group">
                        <span class="control-label">随机范围</span>
                        <div class="button-group">
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: typeFilter === 'all' }"
                                @click="typeFilter = 'all'"
                            >
                                全部
                            </button>
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: typeFilter === 'single' }"
                                @click="typeFilter = 'single'"
                            >
                                单选
                            </button>
                            <button
                                type="button"
                                class="ghost"
                                :class="{ active: typeFilter === 'multi' }"
                                @click="typeFilter = 'multi'"
                            >
                                多选
                            </button>
                        </div>
                        <label class="field">
                            <span>抽取数量</span>
                            <input
                                v-model.number="randomCount"
                                type="number"
                                min="1"
                                :max="randomMax"
                                class="input"
                            />
                            <span class="hint">最多 {{ randomMax }} 题</span>
                        </label>
                        <label class="field">
                            <input v-model="excludeAnswered" type="checkbox" />
                            <span>随机时排除已刷题目</span>
                        </label>
                    </div>

                    <div v-if="mode === 'wrong'" class="control-group hint">
                        当前错题：{{ wrongQuestions.length }} 题
                    </div>
                </div>

                <div class="actions">
                    <button type="button" class="primary" @click="startSession">
                        开始刷题
                    </button>
                    <button
                        v-if="sessionStarted"
                        type="button"
                        class="ghost"
                        @click="restartSession"
                    >
                        重新开始
                    </button>
                </div>
            </section>

            <section v-if="sessionStarted" class="card question-card">
                <div v-if="!currentQuestion" class="empty-state">
                    <h2>暂无题目</h2>
                    <p>请检查筛选条件或先完成一些题目再使用错题本。</p>
                </div>
                <div v-else>
                    <div class="question-header">
                        <span class="progress">{{ progressLabel }}</span>
                        <span class="type-badge">{{
                            currentQuestion.type === "single"
                                ? "单选题"
                                : "多选题"
                        }}</span>
                    </div>
                    <p v-if="showPreviouslyWrong" class="hint">之前答错过</p>
                    <p v-else-if="showCorrectOnce" class="hint">答对一次</p>
                    <h2 class="question-title">{{ currentQuestion.text }}</h2>

                    <div v-if="isSingleChoice(currentQuestion)" class="options">
                        <label
                            v-for="option in optionEntries"
                            :key="option[0]"
                            class="option"
                            :class="{ selected: selectedAnswer === option[0] }"
                        >
                            <input
                                v-model="selectedAnswer"
                                type="radio"
                                name="choice"
                                :value="option[0]"
                                :disabled="submitted"
                            />
                            <span class="option-label">{{ option[0] }}</span>
                            <span>{{ option[1] }}</span>
                        </label>
                    </div>
                    <div v-else class="options">
                        <label
                            v-for="option in optionEntries"
                            :key="option[0]"
                            class="option"
                            :class="{
                                selected: selectedMultiAnswers.includes(
                                    option[0],
                                ),
                            }"
                        >
                            <input
                                v-model="selectedMultiAnswers"
                                type="checkbox"
                                name="multi"
                                :value="option[0]"
                                :disabled="submitted"
                            />
                            <span class="option-label">{{ option[0] }}</span>
                            <span>{{ option[1] }}</span>
                        </label>
                    </div>

                    <div class="question-actions">
                        <button
                            type="button"
                            class="primary"
                            :disabled="!canSubmit"
                            @click="submitAnswer"
                        >
                            提交答案
                        </button>
                        <button
                            type="button"
                            class="ghost"
                            :disabled="!submitted || isLastQuestion"
                            @click="nextQuestion"
                        >
                            下一题
                        </button>
                    </div>

                    <div
                        v-if="submitted"
                        class="result"
                        :class="{
                            correct: lastCorrect,
                            wrong: lastCorrect === false,
                        }"
                    >
                        <span v-if="lastCorrect">回答正确！</span>
                        <span v-else
                            >回答错误，正确答案：{{ correctAnswerLabel }}</span
                        >
                    </div>

                    <div v-if="submitted && isLastQuestion" class="finish">
                        已完成本次刷题，可重新开始或切换模式继续练习。
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>
