import type { StageId } from "./content";
import type { AdventureDifficulty } from "./game";

export type CharacterId = "clover" | "toto" | "pin";

export type AdventureTitle = {
  id: string;
  characterId: CharacterId;
  difficulty: AdventureDifficulty;
  name: string;
  condition: string;
  kind: "campaign" | "score";
};

export const titleDifficultyDetails = {
  easy: { label: "쉬움", mark: "◆", color: "#218a70" },
  normal: { label: "보통", mark: "★", color: "#5042ca" },
  hard: { label: "어려움", mark: "✦", color: "#b13878" },
} satisfies Record<AdventureDifficulty, { label: string; mark: string; color: string }>;

const titleNames: Record<CharacterId, Record<AdventureDifficulty, readonly [string, string, string, string, string]>> = {
  clover: {
    easy: ["새싹 범위 수호자", "안개길 안전 기사", "불꽃 상자 견습장인", "별빛 거울 방패", "하늘성 첫 수호자"],
    normal: ["관문 규칙 수호기사", "초과·미만 추적기사", "올림·버림 대장장이", "반올림 거울 기사", "수의 질서 수호자"],
    hard: ["완전 범위 철벽", "안개 함정 돌파자", "정밀 어림 철갑", "반올림 성운 방패", "다섯 봉인 대수호자"],
  },
  toto: {
    easy: ["범위 숲 길잡이", "안개 발판 탐색가", "불꽃 수레 견습자", "별빛 수 읽기", "하늘성 지도지기"],
    normal: ["수직선 길잡이", "초과·미만 탐색가", "올림·버림 계산가", "반올림 별자리 해석가", "수의 질서 탐험가"],
    hard: ["범위 미로 돌파자", "안개 함정 해독가", "정밀 어림 항해사", "반올림 성운 항해사", "다섯 봉인 대탐색가"],
  },
  pin: {
    easy: ["포함 룬 견습생", "안개 수식 마도사", "불꽃 어림 마법사", "별빛 반올림술사", "수정 왕관 지킴이"],
    normal: ["범위 룬 해석가", "초과·미만 성운술사", "올림·버림 연금술사", "반올림 성운 마도사", "수의 질서 대마도사"],
    hard: ["범위 봉인 대마도사", "안개 수식 파쇄자", "정밀 어림 연금술사", "반올림 별빛 대현자", "다섯 봉인 성운 현자"],
  },
};

const characterIds: CharacterId[] = ["clover", "toto", "pin"];
const difficultyIds: AdventureDifficulty[] = ["easy", "normal", "hard"];

const scoreTitleNames: Record<CharacterId, Record<AdventureDifficulty, string>> = {
  clover: { easy: "새싹 점수 수호자", normal: "정밀 점수 수호자", hard: "전설 점수 수호자" },
  toto: { easy: "별빛 점수 길잡이", normal: "수직선 점수 탐색가", hard: "대항해 점수 탐색가" },
  pin: { easy: "룬 점수 견습생", normal: "성운 점수 마도사", hard: "대현자 점수 마도사" },
};

export const scoreTitleThresholds = { easy: 800, normal: 900, hard: 1000 } satisfies Record<AdventureDifficulty, number>;

const campaignTitles: AdventureTitle[] = characterIds.flatMap((characterId) => difficultyIds.flatMap((difficulty) =>
  titleNames[characterId][difficulty].map((name, index) => ({
    id: `title-${characterId}-${difficulty}-${index + 1}`,
    characterId,
    difficulty,
    name,
    condition: `${titleDifficultyDetails[difficulty].label} 난이도 · 전 스테이지 완주`,
    kind: "campaign" as const,
  })),
));

const scoreTitles: AdventureTitle[] = characterIds.flatMap((characterId) => difficultyIds.map((difficulty) => ({
  id: `score-title-${characterId}-${difficulty}`,
  characterId,
  difficulty,
  name: scoreTitleNames[characterId][difficulty],
  condition: `${titleDifficultyDetails[difficulty].label} 난이도 · 한 전투 ${scoreTitleThresholds[difficulty]}점 이상 승리`,
  kind: "score" as const,
})));

export const adventureTitles: AdventureTitle[] = [...campaignTitles, ...scoreTitles];

const titleStorageKey = "luckypang-v3-range-collected-titles";

export function getTitleDifficulty(difficulty: AdventureDifficulty) { return titleDifficultyDetails[difficulty]; }

export function getCampaignClearTitle(characterId: CharacterId, difficulty: AdventureDifficulty, excludedIds: readonly string[]) {
  const candidates = adventureTitles.filter((title) => title.kind === "campaign" && title.characterId === characterId && title.difficulty === difficulty);
  const excluded = new Set(excludedIds);
  const uncollected = candidates.filter((title) => !excluded.has(title.id));
  const pool = uncollected.length > 0 ? uncollected : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getScoreTitle(characterId: CharacterId, difficulty: AdventureDifficulty) {
  return adventureTitles.find((title) => title.kind === "score" && title.characterId === characterId && title.difficulty === difficulty);
}

export function loadCollectedTitleIds(storage: Storage): string[] {
  try {
    const saved = JSON.parse(storage.getItem(titleStorageKey) ?? "[]") as unknown;
    const validIds = new Set(adventureTitles.map((title) => title.id));
    return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string" && validIds.has(id)))] : [];
  } catch {
    return [];
  }
}

export function saveCollectedTitleId(storage: Storage, titleId: string) {
  const next = [...new Set([...loadCollectedTitleIds(storage), titleId])];
  storage.setItem(titleStorageKey, JSON.stringify(next));
  return next;
}

export function clearCollectedTitles(storage: Storage) { storage.removeItem(titleStorageKey); }

const campaignProgressStorageKey = "luckypang-v3-range-title-campaign-progress";
export type CampaignProgress = Partial<Record<`${CharacterId}-${AdventureDifficulty}`, StageId[]>>;

export function loadTitleCampaignProgress(storage: Storage): CampaignProgress {
  try {
    const saved = JSON.parse(storage.getItem(campaignProgressStorageKey) ?? "{}") as unknown;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, Array.isArray(value) ? value.filter((id): id is StageId => Number.isInteger(id) && id >= 1 && id <= 5) : []])) as CampaignProgress;
  } catch { return {}; }
}

export function saveTitleCampaignStage(storage: Storage, progress: CampaignProgress, characterId: CharacterId, difficulty: AdventureDifficulty, stageId: StageId) {
  const key = `${characterId}-${difficulty}` as const;
  const next = { ...progress, [key]: [...new Set([...(progress[key] ?? []), stageId])].sort() };
  storage.setItem(campaignProgressStorageKey, JSON.stringify(next));
  return next;
}

export function campaignIsComplete(progress: CampaignProgress, characterId: CharacterId, difficulty: AdventureDifficulty) {
  return (progress[`${characterId}-${difficulty}`] ?? []).length === 5;
}

export function clearTitleCampaignProgress(storage: Storage) { storage.removeItem(campaignProgressStorageKey); }
