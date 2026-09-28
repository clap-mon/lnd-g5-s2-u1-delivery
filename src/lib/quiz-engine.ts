import type { StageId } from "./content.ts";

export type Difficulty = "EASY" | "NORMAL" | "HARD";
export type QuizOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  isLucky: boolean;
  isBomb: boolean;
  explanation: string;
  misconception?: string;
};
export type Quiz = { id: string; stageId: StageId; prompt: string; difficulty: Difficulty; options: QuizOption[] };

export function makePrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function seedForQuiz(stageId: StageId, round: number, session = "range-v3"): number {
  let hash = 2166136261;
  for (const char of `${session}:${stageId}:${round}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function int(rng: () => number, min: number, max: number) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick<T>(rng: () => number, values: T[]): T { return values[int(rng, 0, values.length - 1)]; }
function shuffle<T>(rng: () => number, values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) { const j = int(rng, 0, i); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

function finalize(stageId: StageId, round: number, prompt: string, difficulty: Difficulty, rows: Omit<QuizOption, "id" | "isLucky" | "isBomb">[], rng: () => number): Quiz {
  if (rows.length !== 5 || rows.filter((row) => row.isCorrect).length !== 3 || new Set(rows.map((row) => row.text)).size !== 5) throw new Error("퀴즈는 서로 다른 보기 5개와 정답 3개로 구성해야 합니다.");
  const correct = rows.filter((row) => row.isCorrect);
  const wrong = rows.filter((row) => !row.isCorrect);
  const luckyText = pick(rng, correct).text;
  const bombText = pick(rng, wrong).text;
  const options = rows.map((row, index) => ({ ...row, id: `s${stageId}-r${round}-o${index}`, isLucky: row.text === luckyText, isBomb: row.text === bombText }));
  return { id: `stage-${stageId}-round-${round}`, stageId, prompt, difficulty, options: shuffle(rng, options) };
}

function numberRows(correct: number[], wrong: number[], reason: (value: number) => string, misconceptions: string[]) {
  return [...correct.map((value) => ({ text: String(value), isCorrect: true, explanation: reason(value) })), ...wrong.map((value, index) => ({ text: String(value), isCorrect: false, explanation: `${value}은(는) 주어진 범위에 맞지 않아요.`, misconception: misconceptions[index] }))];
}

function excludedRangeRows(lower: number, upper: number) {
  const below = lower - 1;
  return [
    { text: String(lower), isCorrect: true, explanation: `${lower}은(는) ‘${lower} 초과’의 기준 수와 같으므로 범위에 포함되지 않아요.` },
    { text: String(upper), isCorrect: true, explanation: `${upper}은(는) ‘${upper} 미만’의 기준 수와 같으므로 범위에 포함되지 않아요.` },
    { text: String(below), isCorrect: true, explanation: `${below}은(는) ${lower}보다 작으므로 범위에 포함되지 않아요.` },
    { text: String(lower + 1), isCorrect: false, explanation: `${lower + 1}은(는) ${lower}보다 크고 ${upper}보다 작으므로 범위 안에 있어요.`, misconception: "‘초과’의 바로 다음 수를 범위 밖이라고 판단한 오개념이에요." },
    { text: String(upper - 1), isCorrect: false, explanation: `${upper - 1}은(는) ${lower}보다 크고 ${upper}보다 작으므로 범위 안에 있어요.`, misconception: "‘미만’의 바로 앞 수를 범위 밖이라고 판단한 오개념이에요." },
  ];
}

function rangeQuiz(stageId: 1 | 2, round: number, rng: () => number, rangeScale = 1, includeExcludedType = true): Quiz {
  const lower = int(rng, 5, Math.max(20, Math.round(70 * rangeScale)));
  const width = int(rng, 4, 10);
  const upper = lower + width;
  if (stageId === 2 && includeExcludedType && rng() < 1 / 3) {
    return finalize(stageId, round, `${lower} 초과 ${upper} 미만인 자연수 중 범위에 포함되지 않는 카드 한 장을 고르세요.`, round < 3 ? "EASY" : "NORMAL", excludedRangeRows(lower, upper), rng);
  }
  const inclusive = stageId === 1;
  const patterns = inclusive
    ? [
        { prompt: `${lower} 이상 ${upper} 이하인 자연수 카드 한 장을 고르세요.`, inside: [lower, lower + int(rng, 1, width - 1), upper], outside: [lower - int(rng, 1, 3), upper + int(rng, 1, 3)], reason: (n: number) => `${n}은(는) ${lower}과 ${upper}을 모두 포함한 범위 안에 있어요.`, misconceptions: [`아래 기준 수 ${lower}보다 작은 수를 범위 안이라고 판단했어요.`, `위 기준 수 ${upper}보다 큰 수를 범위 안이라고 판단했어요.`] },
        { prompt: `${lower} 이상인 자연수 카드 한 장을 고르세요.`, inside: [lower, lower + 1, upper], outside: [lower - 1, lower - 2], reason: (n: number) => `${n}은(는) ${lower}과 같거나 큰 자연수예요.`, misconceptions: [`‘이상’에서는 ${lower}보다 작은 수를 고르지 않아요.`, "‘이상’을 ‘이하’와 반대로 기억한 오개념이에요."] },
        { prompt: `${upper} 이하인 자연수 카드 한 장을 고르세요.`, inside: [lower, upper - 1, upper], outside: [upper + 1, upper + 2], reason: (n: number) => `${n}은(는) ${upper}과 같거나 작은 자연수예요.`, misconceptions: [`‘이하’에서는 ${upper}보다 큰 수를 고르지 않아요.`, "‘이하’를 ‘이상’과 반대로 기억한 오개념이에요."] },
      ]
    : [
        { prompt: `${lower} 초과 ${upper} 미만인 자연수 카드 한 장을 고르세요.`, inside: [lower + 1, lower + int(rng, 2, width - 2), upper - 1], outside: [lower, upper], reason: (n: number) => `${n}은(는) 두 기준 수를 제외한 범위 안에 있어요.`, misconceptions: ["‘초과’의 아래 기준 수를 포함한 오개념이에요.", "‘미만’의 위 기준 수를 포함한 오개념이에요."] },
        { prompt: `${lower} 초과인 자연수 카드 한 장을 고르세요.`, inside: [lower + 1, lower + 2, upper], outside: [lower, lower - 1], reason: (n: number) => `${n}은(는) ${lower}보다 큰 자연수예요.`, misconceptions: [`‘초과’에서는 ${lower}과 같은 수를 고르지 않아요.`, `‘초과’에서는 ${lower}보다 작은 수를 고르지 않아요.`] },
        { prompt: `${upper} 미만인 자연수 카드 한 장을 고르세요.`, inside: [lower, upper - 2, upper - 1], outside: [upper, upper + 1], reason: (n: number) => `${n}은(는) ${upper}보다 작은 자연수예요.`, misconceptions: [`‘미만’에서는 ${upper}과 같은 수를 고르지 않아요.`, `‘미만’에서는 ${upper}보다 큰 수를 고르지 않아요.`] },
      ];
  const selected = pick(rng, patterns);
  return finalize(stageId, round, selected.prompt, round < 3 ? "EASY" : "NORMAL", numberRows(selected.inside, selected.outside, selected.reason, selected.misconceptions), rng);
}

type RoundingMode = "올림" | "버림" | "반올림";
function placeLabel(place: number) { return place === 10 ? "십" : place === 100 ? "백" : place === 1000 ? "천" : "만"; }
function approximate(value: number, place: number, mode: RoundingMode) {
  if (mode === "올림") return Math.ceil(value / place) * place;
  if (mode === "버림") return Math.floor(value / place) * place;
  return Math.round(value / place) * place;
}
function approximationRows(rng: () => number, mode: RoundingMode, rangeScale = 1) {
  const places = rangeScale < 1 ? [10, 100] : rangeScale > 1 ? [100, 1000] : [10, 100, 1000];
  const place = pick(rng, places);
  const digits = place === 10 ? [100, 980] : place === 100 ? [1000, 9800] : [10000, 98000];
  const valueSet = new Set<number>();
  while (valueSet.size < 5) {
    const value = int(rng, digits[0], digits[1]);
    if (mode === "올림" && value % place === 0) continue;
    valueSet.add(value);
  }
  const values = shuffle(rng, [...valueSet]);
  const correctIndexes = new Set(shuffle(rng, [0, 1, 2, 3, 4]).slice(0, 3));
  const rows = values.map((value, index) => {
    const answer = approximate(value, place, mode);
    const shown = correctIndexes.has(index) ? answer : answer + (index % 2 === 0 ? place : -place);
    const belowDigit = Math.floor((value % place) / (place / 10));
    const correct = shown === answer;
    const explanation = `${value}을(를) ${mode}하여 ${placeLabel(place)}의 자리까지 나타내면 ${answer}이에요.${mode === "반올림" ? ` 바로 아래 자리 숫자 ${belowDigit}을 확인해요.` : ""}`;
    return { text: `${value} → ${shown}`, isCorrect: correct, explanation, misconception: correct ? undefined : mode === "반올림" ? "바로 아래 자리 숫자를 잘못 보거나 올림·버림 방향을 바꾼 오개념이에요." : `구하려는 자리 아래 수를 ${mode === "올림" ? "버린" : "올린"} 오개념이에요.` };
  });
  return { place, rows };
}

function approximationQuiz(stageId: 3 | 4, round: number, rng: () => number, rangeScale = 1): Quiz {
  const mode: RoundingMode = stageId === 4 ? "반올림" : pick(rng, ["올림", "버림"]);
  const { place, rows } = approximationRows(rng, mode, rangeScale);
  return finalize(stageId, round, `${mode}하여 ${placeLabel(place)}의 자리까지 바르게 나타낸 카드 한 장을 고르세요.`, round < 3 ? "EASY" : "NORMAL", rows, rng);
}

function contextQuiz(round: number, rng: () => number, rangeScale = 1): Quiz {
  const group = pick(rng, [10, 100]);
  let count = int(rng, group * 12 + 1, Math.max(group * 16 - 1, Math.round(group * 48 * rangeScale) - 1));
  if (count % group === 0) count += 1;
  const full = Math.floor(count / group);
  const all = Math.ceil(count / group);
  const statements = shuffle(rng, [
    { text: `${count}명을 ${group}명씩 모두 태울 때 최소 ${all}번`, isCorrect: true, explanation: `남은 사람도 모두 타야 하므로 ${count}을(를) 올림하여 ${placeLabel(group)}의 자리까지 나타내면 ${all * group}이고, 최소 ${all}번이에요.` },
    { text: `${count}개를 ${group}개씩 꽉 채운 상자 최대 ${full}개`, isCorrect: true, explanation: `남는 수를 버리면 ${full * group}개이므로 꽉 찬 상자는 ${full}개예요.` },
    { text: `${count}을(를) 반올림하여 ${placeLabel(group)}의 자리까지 나타내면 ${approximate(count, group, "반올림")}`, isCorrect: true, explanation: `${count}에서 구하려는 자리 바로 아래 숫자를 보고 반올림한 값이에요.` },
    { text: `${count}명을 ${group}명씩 모두 태울 때 최소 ${full}번`, isCorrect: false, explanation: `${full}번에는 ${full * group}명만 탈 수 있어 모두 태울 수 없어요.`, misconception: "‘모두’ 필요한 상황에서 버림을 사용한 오개념이에요." },
    { text: `${count}개를 ${group}개씩 꽉 채운 상자 최대 ${all}개`, isCorrect: false, explanation: `마지막 상자는 ${group}개가 차지 않아 꽉 찬 상자가 아니에요.`, misconception: "‘꽉 찬 상자’ 상황에서 올림을 사용한 오개념이에요." },
  ]);
  return finalize(5, round, "생활 상황과 어림 방법이 바르게 연결된 카드 한 장을 고르세요.", "HARD", statements, rng);
}

export function generateQuiz(stageId: StageId, round: number, session = "range-v3", rangeScale = 1): Quiz {
  const rng = makePrng(seedForQuiz(stageId, round, session));
  if (stageId === 1 || stageId === 2) return rangeQuiz(stageId, round, rng, rangeScale);
  if (stageId === 3 || stageId === 4) return approximationQuiz(stageId, round, rng, rangeScale);
  const selector = int(rng, 0, 3);
  if (selector === 0) return rangeQuiz(rng() < 0.5 ? 1 : 2, round, rng, rangeScale, false) as Quiz & { stageId: 5 };
  if (selector === 1) return approximationQuiz(3, round, rng, rangeScale) as Quiz & { stageId: 5 };
  if (selector === 2) return approximationQuiz(4, round, rng, rangeScale) as Quiz & { stageId: 5 };
  return contextQuiz(round, rng, rangeScale);
}

export function generateStageQuiz(stageId: StageId, round: number, session = "range-v3", rangeScale = 1): Quiz {
  const quiz = generateQuiz(stageId, round, session, rangeScale);
  return stageId === 5 ? { ...quiz, id: `stage-5-round-${round}`, stageId: 5 } : quiz;
}
