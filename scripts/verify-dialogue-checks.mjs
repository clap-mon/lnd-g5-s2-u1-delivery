import { stages } from "../src/lib/content.ts";

const expectedChecks = [
  { stage: 1, answers: ["180", "181", "194", "195"] },
  { stage: 1, answers: ["132", "140", "145"] },
  { stage: 2, answers: ["111", "115", "116"] },
  { stage: 2, answers: ["59", "60", "63"] },
  { stage: 5, answers: ["8", "10", "13"] },
];

const checks = stages.flatMap((stage) => stage.dialogue.filter((node) => node.multiCheck).map((node) => ({ stage: stage.id, check: node.multiCheck })));
if (checks.length !== expectedChecks.length) throw new Error(`다중 선택 확인문제 수가 ${checks.length}개입니다.`);

for (const [index, { stage, check }] of checks.entries()) {
  const expectedCheck = expectedChecks[index];
  if (stage !== expectedCheck.stage) throw new Error(`확인문제 ${index + 1}의 스테이지 구성이 올바르지 않습니다.`);
  const answers = check.options.filter((option) => option.isAnswer).map((option) => option.id).sort();
  const expected = [...expectedCheck.answers].sort();
  if (answers.join(",") !== expected.join(",")) throw new Error(`스테이지 ${stage} 정답 구성이 올바르지 않습니다.`);
  if (check.options.length !== 5 || !check.options.every((option) => option.explanation)) throw new Error(`스테이지 ${stage} 선택지 또는 해설 구성이 부족합니다.`);
  if (!check.instruction.includes("모두") || !check.successFeedback) throw new Error(`스테이지 ${stage} 안내 또는 정답 해설이 없습니다.`);
}

console.log(`시나리오 확인문제 검증 완료: 다중 선택 ${checks.length}개`);
