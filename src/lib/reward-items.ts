import type { StageId } from "./content.ts";

export type RewardItemId = "gate-guardian-crystal" | "mist-guide-crystal" | "precision-gear-crystal" | "truth-mirror-crystal";
export type RewardItem = {
  id: RewardItemId;
  stageId: 1 | 2 | 3 | 4;
  name: string;
  icon: string;
  color: string;
  description: string;
  timing: "퀴즈 선택 전" | "행동 단계";
};

export const rewardItems: RewardItem[] = [
  { id: "gate-guardian-crystal", stageId: 1, name: "관문 수호의 수정", icon: "◆", color: "#65f29a", description: "오답 선택지 1개 즉시 봉인", timing: "퀴즈 선택 전" },
  { id: "mist-guide-crystal", stageId: 2, name: "안개길 길잡이 수정", icon: "✦", color: "#56d9ff", description: "보스 방어·결계 해제 · 1턴 혼란", timing: "행동 단계" },
  { id: "precision-gear-crystal", stageId: 3, name: "정밀 태엽 수정", icon: "⚙", color: "#ffcc4d", description: "행동력 +2 · 3/3 초과 가능", timing: "행동 단계" },
  { id: "truth-mirror-crystal", stageId: 4, name: "진실의 거울 수정", icon: "◈", color: "#ff7eb6", description: "2턴 럭키 표시 · 폭탄 봉인", timing: "퀴즈 선택 전" },
];

export function rewardItemForStage(stageId: StageId) { return rewardItems.find((item) => item.stageId === stageId); }
export function rewardItemById(id: RewardItemId) { return rewardItems.find((item) => item.id === id); }
export function canUseRewardItem(id: RewardItemId, phase: "quiz" | "reward" | "action" | "enemy") {
  const item = rewardItemById(id);
  return item?.timing === "퀴즈 선택 전" ? phase === "quiz" : phase === "action";
}
