import assert from "node:assert/strict";
import { generateStageQuiz } from "../src/lib/quiz-engine.ts";

const prompts = new Set();
let stage2ExcludedTypeCount = 0;
for (let stageId = 1; stageId <= 5; stageId += 1) {
  for (let round = 1; round <= 200; round += 1) {
    for (let sessionIndex = 0; sessionIndex < 10; sessionIndex += 1) {
    const quiz = generateStageQuiz(stageId, round, `verify-${round}-${sessionIndex}`);
    assert.equal(quiz.stageId, stageId);
    assert.equal(quiz.options.length, 5);
    assert.equal(quiz.options.filter((option) => option.isCorrect).length, 3);
    assert.equal(quiz.options.filter((option) => option.isLucky).length, 1);
    assert.equal(quiz.options.filter((option) => option.isBomb).length, 1);
    assert.equal(quiz.options.filter((option) => option.isLucky)[0].isCorrect, true);
    assert.equal(quiz.options.filter((option) => option.isBomb)[0].isCorrect, false);
    assert.equal(new Set(quiz.options.map((option) => option.text)).size, 5);
    assert.ok(quiz.options.every((option) => option.explanation.length > 10));
    assert.ok(quiz.options.filter((option) => !option.isCorrect).every((option) => option.misconception));
    assert.doesNotMatch(quiz.prompt, /모두 고르세요/);
    assert.doesNotMatch(JSON.stringify(quiz), /\d+\.\d+/);
    if (stageId === 2 && quiz.prompt.includes("범위에 포함되지 않는")) stage2ExcludedTypeCount += 1;
    prompts.add(quiz.prompt + quiz.options.map((option) => option.text).join("|"));
    }
  }
}
for (let round = 1; round <= 500; round += 1) {
  const quiz = generateStageQuiz(3, round, `ceiling-verify-${round}`);
  if (!quiz.prompt.startsWith("올림하여")) continue;
  const place = quiz.prompt.includes("십의 자리") ? 10 : quiz.prompt.includes("백의 자리") ? 100 : 1000;
  for (const option of quiz.options) assert.notEqual(Number(option.text.split(" → ")[0]) % place, 0, `올림 문항에 변화 없는 수가 포함되었습니다: ${option.text}`);
}

for (let round = 1; round <= 500; round += 1) {
  const quiz = generateStageQuiz(5, round, `wording-verify-${round}`);
  assert.doesNotMatch(JSON.stringify(quiz), /\d+의 자리까지 (올림|버림|반올림)/);
  assert.doesNotMatch(JSON.stringify(quiz), /자리까지 (올림|버림|반올림)(하면|해|한|할)/);
}

assert.ok(prompts.size > 7000, `랜덤 문제 다양성이 부족합니다: ${prompts.size}`);
assert.ok(stage2ExcludedTypeCount > 300, `스테이지 2 제외 유형 출제가 부족합니다: ${stage2ExcludedTypeCount}`);
console.log(`퀴즈 엔진 검증 완료: 10,000문항, 고유 구성 ${prompts.size}개`);
