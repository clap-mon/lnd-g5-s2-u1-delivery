"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { advanceBattleRound, applyRewardItem, battleFinished, battleWon, beginActionPhase, createBattleState, playCombatCard, recoverComboHp, redrawHand, resolveEnemyTurn, retryQuizAfterWrong, rewardQuizAnswer, type BattleState } from "@/lib/battle-engine";
import { clearAdventureProgress, loadRewardItems, loadUnlockedStage, loadUsedRewardItems, saveRewardItems, saveUnlockedStage, saveUsedRewardItems } from "@/lib/adventure-progress";
import type { CombatCard } from "@/lib/card-draw";
import { characters, stages, type DialogueChoice, type DialogueMultiCheck as DialogueMultiCheckData, type StageId } from "@/lib/content";
import { difficulties, getDifficulty, type AdventureDifficulty } from "@/lib/game";
import { generateStageQuiz, type QuizOption } from "@/lib/quiz-engine";
import { playBattleSound, type BattleSound } from "@/lib/battle-sound";
import { canUseRewardItem, rewardItemForStage, rewardItems, type RewardItem, type RewardItemId } from "@/lib/reward-items";
import { adventureTitles, campaignIsComplete, clearCollectedTitles, clearTitleCampaignProgress, getCampaignClearTitle, getScoreTitle, getTitleDifficulty, loadCollectedTitleIds, loadTitleCampaignProgress, saveCollectedTitleId, saveTitleCampaignStage, scoreTitleThresholds, type AdventureTitle, type CampaignProgress } from "@/lib/titles";

type Screen = "landing" | "setup" | "dialogue" | "battle" | "result" | "ending";
type BattleLogKind = "quiz" | "card" | "enemy" | "item" | "draw" | "system";
type BattleLogEntry = { id: number; round: number; kind: BattleLogKind; actor: string; text: string; detail?: string };

const battleLogKindLabel: Record<BattleLogKind, string> = { quiz: "퀴즈", card: "카드", enemy: "적", item: "아이템", draw: "드로우", system: "전투" };

function describeAttackNotice(notice: BattleState["attackNotice"]) {
  if (!notice) return undefined;
  const damageLabel = notice.kind === "physical" ? "물리" : "마법";
  if (notice.defense === 0) return `${damageLabel} 피해 ${notice.damage}`;
  if (notice.brokeShield) return `${damageLabel} 방어막 파괴${notice.damage ? ` · 남은 피해 ${notice.damage}` : ""}`;
  return `${damageLabel} 방어막 -${notice.shieldDamage} · 내구도 ${notice.shieldRemaining}`;
}

function describeEnemyAttack(notice: NonNullable<BattleState["enemyAttackNotice"]>) {
  if (notice.damage > 0) return `집중력 -${notice.damage}`;
  if (notice.outcome === "dodge") return "회피 성공 · 빈틈 포착 +2";
  if (notice.outcome === "shield") return "시험 방패로 완전 방어 · 반격 준비 +2";
  return "방어 성공";
}

function formatBattleLogMeta(log: BattleLogEntry) { return `${log.round}R · ${battleLogKindLabel[log.kind]}${log.kind === "quiz" ? "" : ` · ${log.actor}`}`; }

function describeRoundStart(battle: BattleState, difficulty: AdventureDifficulty) {
  return difficulty === "easy" ? `${battle.bossStance} 태세 · ${battle.intent.label} 예정` : `${battle.bossStance} 태세`;
}

function useDialogKeyboard(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () => dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    const timer = window.setTimeout(focusFirst, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusables.length) return;
      const current = document.activeElement;
      const index = focusables.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || current === dialogRef.current)) { event.preventDefault(); focusables.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusables.length - 1) { event.preventDefault(); focusables[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", onKeyDown); window.setTimeout(() => returnFocusRef.current?.focus(), 0); };
  }, [open]);
  return dialogRef;
}

function getCardPreview(battle: BattleState, card: CombatCard) {
  if (card.effect === "physical" || card.effect === "magic") {
    const defense = card.effect === "physical" ? battle.bossArmor : battle.bossBarrier;
    const label = card.effect === "physical" ? "물리 방어" : "마법 결계";
    const bonus = card.effect === "physical" && defense === 0 ? card.exposedBonus ?? 0 : 0;
    const power = card.power + battle.attackBoost + bonus;
    const bypass = Math.min(card.pierce ?? 0, power);
    const shieldDamage = Math.min(defense, Math.max(0, power - bypass));
    const damage = defense > 0 ? bypass + Math.max(0, power - bypass - defense) : power * (battle.confusedTurns > 0 ? 2 : 1);
    return defense > 0 ? `${label} ${defense} → ${defense - shieldDamage} · 피해 ${damage}` : `보스 HP ${battle.bossHp} → ${Math.max(0, battle.bossHp - damage)}`;
  }
  if (card.effect === "heal") return `집중력 ${battle.playerHp} → ${Math.min(battle.maxPlayerHp, battle.playerHp + card.power)}`;
  if (card.effect === "analyze") return `방어·결계 ${Math.max(battle.bossArmor, battle.bossBarrier)} → ${Math.max(0, Math.max(battle.bossArmor, battle.bossBarrier) - card.power)}`;
  if (card.effect === "guard" || card.effect === "focus-guard") return "다음 물리 공격 완전 방어";
  if (card.effect === "dodge") return "다음 보스 공격 완전 회피";
  if (card.effect === "magic-ward") return `다음 마법 피해 -${card.power}`;
  if (card.effect === "boost") return `다음 직접 공격 +${card.power}`;
  return "손패 2장 새로 뽑기";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [stageId, setStageId] = useState<StageId>(1);
  const [characterId, setCharacterId] = useState<(typeof characters)[number]["id"]>("clover");
  const [difficulty, setDifficulty] = useState<AdventureDifficulty>("normal");
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [resolvedChoice, setResolvedChoice] = useState<number | null>(null);
  const [choiceFeedback, setChoiceFeedback] = useState("");
  const [unlocked, setUnlocked] = useState<StageId>(1);
  const [resetOpen, setResetOpen] = useState(false);
  const [session, setSession] = useState("range-v3");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [battleLogs, setBattleLogs] = useState<BattleLogEntry[]>([]);
  const battleLogId = useRef(0);
  const [answered, setAnswered] = useState<QuizOption | null>(null);
  const [quizHit, setQuizHit] = useState(false);
  const [ownedItems, setOwnedItems] = useState<RewardItemId[]>([]);
  const [usedItems, setUsedItems] = useState<RewardItemId[]>([]);
  const [earnedItem, setEarnedItem] = useState<RewardItem | null>(null);
  const [earnedTitles, setEarnedTitles] = useState<AdventureTitle[]>([]);
  const [collectedTitleIds, setCollectedTitleIds] = useState<string[]>([]);
  const [titleCampaignProgress, setTitleCampaignProgress] = useState<CampaignProgress>({});
  const stage = stages[stageId - 1];
  const character = characters.find((item) => item.id === characterId) ?? characters[0];
  const node = stage.dialogue[dialogueIndex];
  const quiz = useMemo(
    () => generateStageQuiz(stageId, battle?.round ?? 1, session),
    [stageId, battle?.round, session],
  );

  useEffect(() => { const timer = window.setTimeout(() => { setUnlocked(loadUnlockedStage(localStorage)); setOwnedItems(loadRewardItems(localStorage)); setUsedItems(loadUsedRewardItems(localStorage)); setCollectedTitleIds(loadCollectedTitleIds(localStorage)); setTitleCampaignProgress(loadTitleCampaignProgress(localStorage)); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { document.documentElement.classList.toggle("quiz-hit", quizHit); return () => document.documentElement.classList.remove("quiz-hit"); }, [quizHit]);
  useEffect(() => { if (!quizHit) return; const timer = window.setTimeout(() => setQuizHit(false), 820); return () => window.clearTimeout(timer); }, [quizHit]);
  useEffect(() => { const enemyTurn = screen === "battle" && battle?.phase === "enemy" && !battleFinished(battle); document.documentElement.classList.toggle("enemy-turn", enemyTurn); return () => document.documentElement.classList.remove("enemy-turn"); }, [battle, screen]);
  useEffect(() => { const recover = (event: Event) => { const amount = event instanceof CustomEvent ? event.detail : 0; if (screen === "battle" && battle) { const next = recoverComboHp(battle, amount); setBattle(next); if (next !== battle) addBattleLog({ actor: "정답 연쇄", detail: `집중력 +${amount}`, kind: "system", round: battle.round, text: "연쇄 보상 회복" }); } }; window.addEventListener("combo-recover", recover); return () => window.removeEventListener("combo-recover", recover); }, [battle, screen]);
  useEffect(() => { if (screen !== "battle" || !battle || battle.phase !== "enemy" || battleFinished(battle)) return; const timer = window.setTimeout(() => { triggerBattleEffect("stance"); const next = advanceBattleRound(battle, stageId, difficulty, session); setBattle(next); addBattleLog({ actor: "시스템", detail: describeRoundStart(next, difficulty), kind: "system", round: next.round, text: `${next.round}라운드 시작` }); setAnswered(null); }, 1100); return () => window.clearTimeout(timer); }, [battle, difficulty, screen, session, stageId]);
  useEffect(() => {
    if (screen !== "battle" || battle?.phase !== "reward") return;
    const timer = window.setTimeout(() => {
      if (battle.playerHp <= 0) setScreen("result");
      else if (answered?.isCorrect) setBattle(beginActionPhase(battle));
      else { setBattle(retryQuizAfterWrong(battle)); setAnswered(null); }
    }, answered?.isCorrect ? 2000 : 1650);
    return () => window.clearTimeout(timer);
  }, [answered, battle, screen]);
  function beginStage() { setDialogueIndex(0); setResolvedChoice(null); setChoiceFeedback(""); setScreen("dialogue"); }
  function chooseDialogue(choice: DialogueChoice, index: number) { setResolvedChoice(choice.correct ? index : -1); setChoiceFeedback(choice.feedback); }
  function nextDialogue() { if ((node.choices || node.multiCheck) && (resolvedChoice === null || resolvedChoice === -1)) return; if (dialogueIndex < stage.dialogue.length - 1) { setDialogueIndex((value) => value + 1); setResolvedChoice(null); setChoiceFeedback(""); return; } startBattle(); }
  function addBattleLog(entry: Omit<BattleLogEntry, "id">) { battleLogId.current += 1; setBattleLogs((logs) => [...logs, { ...entry, id: battleLogId.current }].slice(-10)); }
  function startBattle() { const nextSession = `${Date.now()}-${Math.random()}`; const nextBattle = createBattleState(stageId, difficulty, nextSession, character); setSession(nextSession); battleLogId.current = 0; setBattleLogs([]); setBattle(nextBattle); addBattleLog({ actor: "시스템", detail: describeRoundStart(nextBattle, difficulty), kind: "system", round: 1, text: "전투 시작" }); setAnswered(null); setQuizHit(false); setEarnedItem(null); setEarnedTitles([]); setScreen("battle"); }
  function triggerBattleEffect(effect: BattleSound) { playBattleSound(effect); }
  function answerQuiz(option: QuizOption) { if (!battle || answered || battle.phase !== "quiz") return; triggerBattleEffect(option.isCorrect ? "correct" : "wrong"); const next = rewardQuizAnswer(battle, option.isCorrect, option.isLucky, option.isBomb); setAnswered(option); setQuizHit(!option.isCorrect); setBattle(next); addBattleLog({ actor: "퀴즈", detail: option.isCorrect ? `행동력 +${next.energy}${option.isLucky ? " · 럭키 정답" : ""}` : `집중력 -${battle.playerHp - next.playerHp}${option.isBomb ? " · 폭탄 오답" : ""}`, kind: "quiz", round: battle.round, text: option.isCorrect ? "정답 선택" : "오답 선택" }); }
  function continueToAction() { if (!battle || battle.phase !== "reward" || !answered?.isCorrect) return; setBattle(beginActionPhase(battle)); }
  function playCard(card: CombatCard) { if (!battle) return; triggerBattleEffect(card.effect === "magic" ? "magic" : card.effect === "guard" || card.effect === "focus-guard" || card.effect === "magic-ward" || card.effect === "heal" ? "guard" : card.effect === "dodge" ? "dodge" : "physical"); const next = playCombatCard(battle, card.instanceId); setBattle(next); const supportDetails: Partial<Record<CombatCard["effect"], string>> = { guard: "다음 물리 공격 무효", "focus-guard": "물리 무효 · 집중력 +2", "magic-ward": `마법 피해 ${card.power} 감소`, dodge: "다음 공격 완전 회피", heal: `집중력 +${card.power}`, boost: `다음 직접 공격 +${card.power}`, analyze: `방어·결계 -${card.power}`, accelerate: "오래된 카드 버림 · 2장 드로우" }; addBattleLog({ actor: battle.playerName, detail: describeAttackNotice(next.attackNotice) ?? supportDetails[card.effect] ?? next.message, kind: "card", round: battle.round, text: `${card.name} 사용` }); }
  function redraw() { if (!battle) return; const next = redrawHand(battle, stageId, session); setBattle(next); addBattleLog({ actor: battle.playerName, detail: `카드 ${battle.hand.length}장 교체 · 행동력 -2`, kind: "draw", round: battle.round, text: "새로 뽑기" }); }
  function useItem(itemId: RewardItemId) {
    if (!battle || !ownedItems.includes(itemId) || usedItems.includes(itemId) || !canUseRewardItem(itemId, battle.phase)) return;
    const next = applyRewardItem(battle, itemId); setBattle(next); addBattleLog({ actor: "가방", detail: next.message, kind: "item", round: battle.round, text: rewardItems.find((item) => item.id === itemId)?.name ?? "고유 수정 사용" });
    const nextUsed = [...usedItems, itemId]; setUsedItems(nextUsed); saveUsedRewardItems(localStorage, nextUsed);
  }
  function endTurn() { if (!battle) return; triggerBattleEffect("enemy"); const next = resolveEnemyTurn(battle); setBattle(next); const defeated = next.bossHp <= 0; const detail = next.enemyAttackNotice ? describeEnemyAttack(next.enemyAttackNotice) : defeated ? next.message : battle.confusedTurns > 0 ? "혼란으로 공격을 건너뜀" : battle.intent.type === "prepare" ? "공격을 준비함" : next.message; addBattleLog({ actor: stage.bossShortName, detail, kind: "enemy", round: battle.round, text: next.enemyAttackNotice ? battle.intent.label : defeated ? "보스 격파" : battle.confusedTurns > 0 ? "행동 불가" : "행동 준비" }); }
  function continueAfterEnemy() { if (!battle) return; if (battleFinished(battle)) { finishBattle(battle); return; } triggerBattleEffect("stance"); setBattle(advanceBattleRound(battle, stageId, difficulty, session)); setAnswered(null); }
  function finishBattle(finalState: BattleState) { setBattle(finalState); if (battleWon(finalState)) { const nextUnlocked = Math.min(5, Math.max(unlocked, stageId + 1)) as StageId; setUnlocked(nextUnlocked); saveUnlockedStage(localStorage, nextUnlocked); const reward = rewardItemForStage(stageId); if (reward && !ownedItems.includes(reward.id)) { const nextItems = [...ownedItems, reward.id]; setOwnedItems(nextItems); saveRewardItems(localStorage, nextItems); setEarnedItem(reward); } const campaignProgress = saveTitleCampaignStage(localStorage, titleCampaignProgress, characterId, difficulty, stageId); setTitleCampaignProgress(campaignProgress); let nextCollectedIds = collectedTitleIds; const newlyEarned: AdventureTitle[] = []; const collectTitle = (title: AdventureTitle | undefined) => { if (!title || nextCollectedIds.includes(title.id)) return; nextCollectedIds = saveCollectedTitleId(localStorage, title.id); newlyEarned.push(title); }; const scoreTitle = getScoreTitle(characterId, difficulty); if (finalState.score >= scoreTitleThresholds[difficulty]) collectTitle(scoreTitle); if (stageId === 5 && campaignIsComplete(campaignProgress, characterId, difficulty)) collectTitle(getCampaignClearTitle(characterId, difficulty, nextCollectedIds)); if (newlyEarned.length > 0) { setCollectedTitleIds(nextCollectedIds); setEarnedTitles(newlyEarned); } } setScreen("result"); }
  function resetProgress() { clearAdventureProgress(localStorage); clearCollectedTitles(localStorage); clearTitleCampaignProgress(localStorage); setUnlocked(1); setStageId(1); setOwnedItems([]); setUsedItems([]); setEarnedItem(null); setEarnedTitles([]); setCollectedTitleIds([]); setTitleCampaignProgress({}); setResetOpen(false); }

  if (screen === "landing") return <Landing collectedTitleIds={collectedTitleIds} onStart={() => setScreen("setup")} />;
  if (screen === "setup") return <Setup characterId={characterId} difficulty={difficulty} onBack={() => setScreen("landing")} onCancelReset={() => setResetOpen(false)} onCharacter={setCharacterId} onConfirmReset={resetProgress} onDifficulty={setDifficulty} onOpenReset={() => setResetOpen(true)} onStage={setStageId} onStart={beginStage} resetOpen={resetOpen} selectedStage={stageId} unlocked={unlocked} />;
  if (screen === "dialogue") return <Dialogue character={character} choiceFeedback={choiceFeedback} node={node} nodeIndex={dialogueIndex} onBack={() => setScreen("setup")} onChoice={chooseDialogue} onMultiResolved={() => setResolvedChoice(0)} onNext={nextDialogue} onSkip={startBattle} resolvedChoice={resolvedChoice} stage={stage} />;
  if (screen === "battle" && battle) return <Battle answered={answered} battle={battle} character={character} difficulty={difficulty} logs={battleLogs} onAnswer={answerQuiz} onContinueEnemy={continueAfterEnemy} onContinueToAction={continueToAction} onEndTurn={endTurn} onExit={() => setScreen("setup")} onPlayCard={playCard} onRedraw={redraw} onUseItem={useItem} ownedItems={ownedItems} quiz={quiz} stage={stage} usedItems={usedItems} />;
  if (screen === "result" && battle) return <Result earnedItem={earnedItem} earnedTitles={earnedTitles} onNext={() => { if (battleWon(battle) && stageId < 5) { setStageId((stageId + 1) as StageId); setDialogueIndex(0); setResolvedChoice(null); setChoiceFeedback(""); setScreen("dialogue"); } else if (battleWon(battle)) setScreen("ending"); else startBattle(); }} onSetup={() => setScreen("setup")} score={battle.score} stage={stage} won={battleWon(battle)} />;
  return <Ending onMain={() => setScreen("landing")} score={battle?.score ?? 0} />;
}

function Landing({ collectedTitleIds, onStart }: { collectedTitleIds: string[]; onStart: () => void }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [titleCollectionOpen, setTitleCollectionOpen] = useState(false);
  return <main className="landing-page"><div className="pixel-grid" /><section aria-label="럭키팡 숫자던전: 수의 범위와 어림하기" className="landing-shell"><div className="landing-art-card"><img alt="수의 범위와 어림하기 던전을 탐험하는 클로버, 핀, 토토" className="landing-art" src="/luckypang_number_range_thumbnail_v2.webp" /></div><div className="landing-actions"><button className="landing-button start" onClick={onStart}>시작하기! <span aria-hidden="true">🏰</span></button><div className="landing-action-row"><button className="landing-button help" onClick={() => setGuideOpen(true)}>사용 안내 <span aria-hidden="true">📖</span></button><button aria-label={`칭호 도감, ${collectedTitleIds.length}개 획득`} className="title-cabinet-button" onClick={() => setTitleCollectionOpen(true)} type="button"><i aria-hidden="true">🏅</i><b>칭호 도감</b><span>{collectedTitleIds.length} / {adventureTitles.length}</span></button></div></div></section>{guideOpen && <LandingGuide onClose={() => setGuideOpen(false)} />}{titleCollectionOpen && <TitleCollection collectedTitleIds={collectedTitleIds} onClose={() => setTitleCollectionOpen(false)} />}</main>;
}

function TitleCollection({ collectedTitleIds, onClose }: { collectedTitleIds: string[]; onClose: () => void }) {
  const [characterId, setCharacterId] = useState<(typeof characters)[number]["id"]>("clover");
  const [difficulty, setDifficulty] = useState<AdventureDifficulty>("easy");
  const collected = new Set(collectedTitleIds);
  const titles = adventureTitles.filter((title) => title.characterId === characterId && title.difficulty === difficulty);
  const detail = getTitleDifficulty(difficulty);
  return <div className="title-collection-backdrop" onMouseDown={onClose}><section aria-labelledby="title-collection-title" aria-modal="true" className="title-collection-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog"><button aria-label="칭호 도감 닫기" className="title-collection-close" onClick={onClose} type="button">×</button><header className="title-collection-header"><span aria-hidden="true">🏅</span><div><h2 id="title-collection-title">칭호 도감 <b>{collectedTitleIds.length} / {adventureTitles.length}</b></h2><p>전 스테이지 완주 또는 점수 도전으로 칭호를 얻어요.</p></div></header><div aria-label="캐릭터 선택" className="title-character-tabs">{characters.map((character) => <button aria-pressed={characterId === character.id} className={characterId === character.id ? "selected" : ""} key={character.id} onClick={() => setCharacterId(character.id)} type="button"><img alt="" src={character.image} />{character.name}</button>)}</div><div aria-label="난이도 선택" className="title-difficulty-tabs">{difficulties.map((item) => <button aria-pressed={difficulty === item.id} className={`${item.id} ${difficulty === item.id ? "selected" : ""}`} key={item.id} onClick={() => setDifficulty(item.id)} type="button"><i>{getTitleDifficulty(item.id).mark}</i>{item.name}<small>{adventureTitles.filter((title) => title.characterId === characterId && title.difficulty === item.id && collected.has(title.id)).length} / 6</small></button>)}</div><div aria-label={`${characters.find((character) => character.id === characterId)?.name} ${detail.label} 칭호 목록`} className="title-badge-grid">{titles.map((title) => { const isCollected = collected.has(title.id); return <article className={`title-badge ${isCollected ? "collected" : "locked"}`} key={title.id} style={{ "--title-color": detail.color } as React.CSSProperties}><i>{title.kind === "score" ? "✹" : detail.mark}</i><small>{title.condition}</small><strong>{isCollected ? title.name : "???"}</strong><em>{isCollected ? "획득함" : title.kind === "score" ? "점수 도전" : "미획득"}</em></article>; })}</div></section></div>;
}

function LandingGuide({ onClose }: { onClose: () => void }) {
  return <div className="landing-guide-backdrop" onMouseDown={onClose}><section aria-labelledby="landing-guide-title" aria-modal="true" className="landing-guide" onMouseDown={(event) => event.stopPropagation()} role="dialog"><button aria-label="사용 안내 닫기" className="guide-close" onClick={onClose} type="button">×</button><p className="eyebrow">HOW TO PLAY</p><h2 id="landing-guide-title">수의 던전 모험 안내</h2>
    <section className="guide-section"><h3>이렇게 모험해요</h3><ol><li><b>1</b><span><strong>탐험을 준비해요.</strong>캐릭터, 난이도, 도전할 스테이지를 고릅니다.</span></li><li><b>2</b><span><strong>이야기와 확인문제를 풀어요.</strong>대화를 읽고 수의 범위와 어림 방법을 확인해요.</span></li><li><b>3</b><span><strong>전투 퀴즈를 맞혀요.</strong>정답 카드로 이번 턴 행동력을 얻어요.</span></li><li><b>4</b><span><strong>카드를 내고 보스를 물리쳐요.</strong>보스의 HP를 0으로 만들면 다음 모험이 열려요.</span></li></ol></section>
    <section className="guide-section"><h3>전투는 이렇게 해요</h3><ol><li><b>1</b><span><strong>퀴즈 카드 5장 중 정답은 3장이에요.</strong>일반 정답은 행동력 2, 럭키 정답은 행동력 3을 줘요. 폭탄 카드는 오답이니 조심하세요.</span></li><li><b>2</b><span><strong>행동력만큼 카드를 조합해요.</strong>카드 왼쪽 위 숫자만큼 행동력이 필요하며, 남은 행동력 안에서 여러 장을 낼 수 있어요.</span></li><li><b>3</b><span><strong>보스 태세를 살펴봐요.</strong>물리 방어에는 마법 카드, 마법 결계에는 공격 카드가 도움이 돼요.</span></li><li><b>4</b><span><strong>내 턴 뒤에는 보스가 공격해요.</strong>수비·회피·회복 카드로 다음 공격에 대비하세요.</span></li></ol></section>
    <section className="guide-section"><h3>캐릭터와 난이도</h3><p><b>클로버</b>는 물리 방어 4의 수호기사, <b>토토</b>는 물리·마법 방어 2의 균형형, <b>핀</b>은 마법 방어 4의 마도사예요.</p><p><b>쉬움</b>은 집중력이 높고 보스가 약하며, <b>보통</b>은 기본 난이도, <b>어려움</b>은 보스가 강하지만 같은 수학 개념을 배워요.</p></section>
    <section className="guide-section"><h3>고유 수정 보상</h3><p>스테이지 1~4 보스를 처음 물리치면 고유 수정을 얻어요. 전투 중 가방에서 사용할 수 있지만, <b>한 게임 진행 전체에서 수정별로 한 번만</b> 사용할 수 있어요.</p></section>
    <section className="guide-section"><h3>스테이지 순서</h3><p>1 이상·이하 → 2 초과·미만 → 3 올림·버림 → 4 반올림 → 5 종합 적용 순서로 수의 범위와 어림 방법을 익혀요.</p></section>
    <section className="guide-section"><h3>이미지 안내</h3><p><b>게임 속 일부 캐릭터와 배경 이미지는 AI 이미지 생성 도구를 활용해 제작했습니다.</b></p></section>
    <button className="guide-confirm" onClick={onClose} type="button">모험 준비 완료</button>
  </section></div>;
}

function Setup({ characterId, difficulty, onBack, onCancelReset, onCharacter, onConfirmReset, onDifficulty, onOpenReset, onStage, onStart, resetOpen, selectedStage, unlocked }: { characterId: string; difficulty: AdventureDifficulty; onBack: () => void; onCancelReset: () => void; onCharacter: (id: (typeof characters)[number]["id"]) => void; onConfirmReset: () => void; onDifficulty: (id: AdventureDifficulty) => void; onOpenReset: () => void; onStage: (id: StageId) => void; onStart: () => void; resetOpen: boolean; selectedStage: StageId; unlocked: StageId }) {
  const selected = stages[selectedStage - 1]; const selectedCharacter = characters.find((item) => item.id === characterId) ?? characters[0]; const selectedDifficulty = getDifficulty(difficulty);
  return <main className="setup-page"><section className="setup-shell"><header className="topbar"><button onClick={onBack}>← 처음으로</button><div><span>ADVENTURE READY</span><h1>모험 준비</h1></div><button onClick={onOpenReset}>진행 기록 초기화</button></header><section className="setup-block"><SectionTitle number="01" title="캐릭터 고르기" subtitle="함께 모험할 탐험가를 고르세요" /><div className="character-grid">{characters.map((item) => <button aria-pressed={characterId === item.id} className={characterId === item.id ? "selected" : ""} key={item.id} onClick={() => onCharacter(item.id)}><img alt="" src={item.image} /><span><strong>{item.name}</strong><small>{item.role}</small></span></button>)}</div></section><section className="setup-block"><SectionTitle number="02" title="난이도 고르기" subtitle="도전할 모험 난이도를 고르세요" /><div className="difficulty-grid">{difficulties.map((item) => <button aria-pressed={difficulty === item.id} className={difficulty === item.id ? "selected" : ""} key={item.id} onClick={() => onDifficulty(item.id)}><strong>{item.name}</strong></button>)}</div></section><section className="setup-block"><SectionTitle number="03" title="스테이지 선택" subtitle="완료한 스테이지와 지금 도전할 스테이지를 고를 수 있어요" /><div className="stage-grid">{stages.map((item) => { const locked = item.id > unlocked; return <button className={`${selectedStage === item.id ? "selected" : ""} ${locked ? "locked" : ""}`} disabled={locked} key={item.id} onClick={() => onStage(item.id)}><span>{locked ? "🔒" : item.id}</span><strong>{item.shortTitle}</strong><small>{item.title}</small></button>; })}</div></section><footer className="setup-summary"><div><img alt="" src={selectedCharacter.image} /><p><small>선택 완료</small><strong>{selectedCharacter.name} · {selectedDifficulty.name} 난이도</strong><em>STAGE {selected.id}. {selected.title}</em></p></div><button onClick={onStart}>이야기 시작 →</button></footer></section>{resetOpen && <ConfirmReset onCancel={onCancelReset} onConfirm={onConfirmReset} />}</main>;
}
function SectionTitle({ number, subtitle, title }: { number: string; subtitle: string; title: string }) { return <div className="section-title"><b>{number}</b><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
function ConfirmReset({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) { return <div className="modal-backdrop"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><span>↻</span><p className="eyebrow">PROGRESS RESET</p><h2 id="reset-title">진행 기록을 지울까요?</h2><p>이 기기에 저장된 스테이지 완료 기록이 사라집니다.</p><div><button onClick={onCancel}>아니요</button><button onClick={onConfirm}>초기화할게요</button></div></section></div>; }

function Dialogue({ character, choiceFeedback, node, nodeIndex, onBack, onChoice, onMultiResolved, onNext, onSkip, resolvedChoice, stage }: { character: (typeof characters)[number]; choiceFeedback: string; node: (typeof stages)[number]["dialogue"][number]; nodeIndex: number; onBack: () => void; onChoice: (choice: DialogueChoice, index: number) => void; onMultiResolved: () => void; onNext: () => void; onSkip: () => void; resolvedChoice: number | null; stage: (typeof stages)[number] }) {
  const isHero = node.speaker === "주인공"; const isBoss = node.speaker === "보스"; const speakerName = isHero ? character.name : isBoss ? stage.bossShortName : node.speaker; const portrait = isHero ? character.image : isBoss ? stage.bossImage : "/characters/saembyeol.webp"; const canNext = (!node.choices && !node.multiCheck) || (resolvedChoice !== null && resolvedChoice >= 0);
  useEffect(() => {
    document.querySelector(".concept-banner small")?.replaceChildren("스테이지 핵심개념");
    function handleDialogueClick(event: MouseEvent) {
      if (!canNext || !(event.target instanceof Element)) return;
      const dialogueBox = event.target.closest(".dialogue-box");
      if (dialogueBox && !event.target.closest("button")) onNext();
    }
    document.addEventListener("click", handleDialogueClick);
    return () => document.removeEventListener("click", handleDialogueClick);
  }, [canNext, onNext]);
  return <main className="dialogue-page" onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && canNext) onNext(); }} style={{ "--stage": stage.color } as React.CSSProperties} tabIndex={0}><header className="dialogue-bar"><button onClick={onBack}>← 메인</button><div><span>STAGE {stage.id}</span><strong>{stage.title}</strong></div><button onClick={onSkip}>대화 건너뛰기</button></header><section className="dialogue-world" style={{ backgroundImage: `linear-gradient(180deg,transparent 35%,#08091ddd 83%),url(${stage.background})` }}><img className={`world-hero ${isHero ? "speaking" : "dim"}`} alt="" src={character.image} /><img className={`world-guide ${node.speaker === "셈별" ? "speaking" : "dim"}`} alt="" src="/characters/saembyeol.webp" /><img className={`world-boss ${isBoss ? "speaking" : "dim"}`} alt="" src={stage.bossImage} /><div className="concept-banner"><small>오늘의 핵심</small><strong>{stage.concept}</strong></div></section><section className="dialogue-box"><img alt={`${speakerName} 초상`} src={portrait} /><div className="dialogue-copy"><header>{isBoss ? <div className="dialogue-boss-name"><small>{stage.bossTitle}</small><strong>{stage.bossShortName}</strong></div> : <strong>{speakerName}</strong>}<span>{node.choices || node.multiCheck ? "CONCEPT CHECK" : "STORY"}</span><i>{nodeIndex + 1} / {stage.dialogue.length}</i></header><p>{node.text}</p>{node.choices && <div className="dialogue-choices">{node.choices.map((choice, index) => <button className={resolvedChoice === index ? "correct" : ""} disabled={resolvedChoice !== null && resolvedChoice >= 0} key={choice.text} onClick={() => onChoice(choice, index)}>{choice.text}</button>)}</div>}{node.multiCheck && <DialogueMultiCheck key={`multi-${nodeIndex}`} check={node.multiCheck} onResolved={onMultiResolved} />}{choiceFeedback && <div className={`feedback ${resolvedChoice === -1 ? "wrong" : "correct"}`}>{resolvedChoice === -1 ? "다시 생각해 봐요. " : "정답! "}{choiceFeedback}</div>}</div><button className="next-button" disabled={!canNext} onClick={onNext}>{nodeIndex === stage.dialogue.length - 1 ? "전투 시작" : "다음"} →</button></section><p className="dialogue-hint">대화창을 선택한 뒤 Enter / Space로 진행할 수 있어요</p></main>;
}

function DialogueMultiCheck({ check, onResolved }: { check: DialogueMultiCheckData; onResolved: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [passed, setPassed] = useState(false);
  const toggleOption = (id: string) => { if (passed) return; setFeedback([]); setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); };
  const submit = () => {
    const selected = new Set(selectedIds); const missed = check.options.filter((option) => option.isAnswer && !selected.has(option.id)); const incorrect = check.options.filter((option) => !option.isAnswer && selected.has(option.id));
    if (!missed.length && !incorrect.length) { setPassed(true); setFeedback([check.successFeedback]); onResolved(); return; }
    const messages = [...incorrect.map((option) => `${option.text}: ${option.explanation}`), ...missed.map((option) => `${option.text}도 골라야 해요: ${option.explanation}`)];
    setFeedback(messages);
  };
  const retry = () => { setSelectedIds([]); setFeedback([]); };
  return <section className="dialogue-multi-check" aria-label="여러 개 선택 확인문제"><small>{check.instruction}</small><div className="dialogue-multi-options">{check.options.map((option) => <button aria-pressed={selectedIds.includes(option.id)} className={`${selectedIds.includes(option.id) ? "selected" : ""} ${passed && option.isAnswer ? "answer" : ""}`} disabled={passed} key={option.id} onClick={() => toggleOption(option.id)} type="button"><b>{selectedIds.includes(option.id) ? "✓" : "+"}</b>{option.text}</button>)}</div><div className="dialogue-multi-actions"><button disabled={!selectedIds.length || passed} onClick={submit} type="button">선택 완료</button>{feedback.length > 0 && !passed && <button className="retry" onClick={retry} type="button">다시 고르기</button>}</div>{feedback.length > 0 && <div className={`multi-feedback ${passed ? "correct" : "wrong"}`} role="status"><strong>{passed ? "정답!" : "다시 확인해 봐요."}</strong><ul>{feedback.map((message) => <li key={message}>{message}</li>)}</ul></div>}</section>;
}

function Battle({ answered, battle, character, difficulty, logs, onAnswer, onContinueEnemy, onContinueToAction, onEndTurn, onExit, onPlayCard, onRedraw, onUseItem, ownedItems, quiz, stage, usedItems }: { answered: QuizOption | null; battle: BattleState; character: (typeof characters)[number]; difficulty: AdventureDifficulty; logs: BattleLogEntry[]; onAnswer: (option: QuizOption) => void; onContinueEnemy: () => void; onContinueToAction: () => void; onEndTurn: () => void; onExit: () => void; onPlayCard: (card: CombatCard) => void; onRedraw: () => void; onUseItem: (itemId: RewardItemId) => void; ownedItems: RewardItemId[]; quiz: ReturnType<typeof generateStageQuiz>; stage: (typeof stages)[number]; usedItems: RewardItemId[] }) {
  const [logOpen, setLogOpen] = useState(false);
  const [minimizedQuizRound, setMinimizedQuizRound] = useState<number | null>(null);
  const quizMinimized = battle.phase === "quiz" && minimizedQuizRound === battle.round;
  const latestCombatLog = logs.at(-1);
  const logDialogRef = useDialogKeyboard(logOpen, () => setLogOpen(false));
  return <main className="battle-page" style={{ "--stage": stage.color, backgroundImage: `linear-gradient(#070a1baa,#070a1bee),url(${stage.background})` } as React.CSSProperties}>
    <header className="combat-header"><strong>럭키팡 숫자던전: 수의 범위와 어림하기</strong><span>STAGE {stage.id} · {stage.shortTitle} / {getDifficulty(difficulty).badge}</span><div className="combat-header-actions"><button aria-expanded={logOpen} onClick={() => setLogOpen(true)} type="button">전투 로그</button><button onClick={onExit}>메뉴로 나가기</button></div></header>
    <section className="combat-stats"><Stat label={`${character.name} HP`} value={`${battle.playerHp} / ${battle.maxPlayerHp}`} /><Stat label={battle.physicalShield ? "물리 방패" : "물리 방어"} value={battle.physicalShield ? `${battle.basePhysicalDefense} · 준비` : battle.basePhysicalDefense + battle.physicalGuard} /><Stat label="마법 방어" value={battle.baseMagicDefense + battle.magicGuard} /><Stat label="정답 연쇄" value={`${battle.combo} / 3`} /><BagStat battle={battle} onUseItem={onUseItem} ownedItems={ownedItems} usedItems={usedItems} /><Stat label="보스 방어" value={`물리 ${battle.bossArmor} · 마법 ${battle.bossBarrier}`} /><Stat label="BOSS HP" value={`${battle.bossHp} / ${battle.maxBossHp}`} /></section>
    <section className="battlefield"><Fighter battle={battle} image={character.image} label={character.name} side="hero" /><div className={`turn-energy ${battle.phase === "action" ? "active" : ""}`}><small>이번 턴 행동력</small><strong>{battle.energy}<i>/3</i></strong><span>{battle.phase === "action" ? "카드를 낼 수 있어요" : battle.phase.toUpperCase()}</span></div><Fighter battle={battle} image={stage.bossImage} label={stage.bossName} showIntent={difficulty === "easy"} side="boss" /></section>
    <p aria-atomic="true" aria-live="polite" className="sr-only">{battle.message}</p><button aria-haspopup="dialog" className="battle-message" onClick={() => setLogOpen(true)} type="button">{battle.message}</button>
    {logOpen && <div className="battle-log-backdrop" onMouseDown={() => setLogOpen(false)}><section aria-labelledby="battle-log-title" aria-modal="true" className="battle-log-modal" onMouseDown={(event) => event.stopPropagation()} ref={logDialogRef} role="dialog"><header><div><p>RECENT BATTLE LOG</p><h2 id="battle-log-title">최근 전투 기록 <span>{logs.length} / 10</span></h2></div><button aria-label="전투 로그 닫기" onClick={() => setLogOpen(false)} type="button">×</button></header>{logs.length === 0 ? <p className="empty-battle-log">아직 전투 기록이 없어요. 문제를 풀거나 카드를 사용하면 여기에 표시됩니다.</p> : <ol>{[...logs].reverse().map((log, index) => <li key={log.id}><b>{logs.length - index}</b><div><span className="battle-log-meta">{formatBattleLogMeta(log)}</span><strong>{log.text}</strong>{log.detail && <small>{log.detail}</small>}</div></li>)}</ol>}<small>최근 10개까지 기록됩니다.</small></section></div>}
    {quizMinimized && <button className="quiz-reopen" onClick={() => setMinimizedQuizRound(null)} type="button">문제 보기</button>}
    {(battle.phase === "action" || quizMinimized) && <ActionPanel battle={battle} difficulty={difficulty} onEndTurn={onEndTurn} onPlayCard={onPlayCard} onRedraw={onRedraw} preview={quizMinimized} />}
    {(battle.phase === "quiz" || battle.phase === "reward") && !quizMinimized && <QuizModal answered={answered} battle={battle} battleLog={latestCombatLog} difficulty={difficulty} onAnswer={onAnswer} onContinueToAction={onContinueToAction} onMinimize={() => setMinimizedQuizRound(battle.round)} quiz={quiz} />}
    {battle.phase === "enemy" && <div className="phase-banner"><p>ENEMY TURN</p><h2>{battle.message}</h2><button onClick={onContinueEnemy}>{battleFinished(battle) ? "전투 결과" : "다음 문제"} →</button></div>}
  </main>;
}
function Stat({ label, value }: { label: string; value: number | string }) { if (label === "정답 연쇄") return <ComboStat combo={Number(String(value).split("/")[0].trim())} />; const detail = ["물리 방어", "물리 방패", "마법 방어", "보스 방어"].includes(label); return <div className={detail ? "detail-stat" : "primary-stat"}><span>{label}</span><strong>{value}</strong></div>; }
function ComboStat({ combo }: { combo: number }) { const ready = combo >= 3; function recover() { window.dispatchEvent(new CustomEvent("combo-recover", { detail: Math.floor(Math.random() * 5) + 1 })); } return <div className="combo-stat primary-stat"><span>정답 연쇄</span><strong>{combo} / 3</strong>{ready ? <button onClick={recover}>HP 회복</button> : <small>오답 시 절반으로 감소</small>}</div>; }
function BagStat({ battle, onUseItem, ownedItems, usedItems }: { battle: BattleState; onUseItem: (itemId: RewardItemId) => void; ownedItems: RewardItemId[]; usedItems: RewardItemId[] }) {
  const [open, setOpen] = useState(false);
  const usableCount = ownedItems.filter((id) => !usedItems.includes(id)).length;
  const bagDialogRef = useDialogKeyboard(open, () => setOpen(false));
  return <div className="bag-stat"><button aria-expanded={open} onClick={() => setOpen(true)} type="button"><span>ITEMS</span><strong>가방 <b>{usableCount}</b></strong></button>{open && <div className="bag-modal-backdrop" onMouseDown={() => setOpen(false)}><section aria-labelledby="bag-title" aria-modal="true" className="bag-modal" onMouseDown={(event) => event.stopPropagation()} ref={bagDialogRef} role="dialog"><span>🎒</span><p className="eyebrow">RELIC BAG</p><h2 id="bag-title">고유 수정 가방</h2><p>한 게임에서 각 수정은 한 번만 사용할 수 있어요.</p><div className="reward-item-list">{rewardItems.map((item) => { const owned = ownedItems.includes(item.id); const used = usedItems.includes(item.id); const usable = owned && !used && canUseRewardItem(item.id, battle.phase); return <article className={`${owned ? "owned" : "locked"} ${used ? "used" : ""}`} key={item.id} style={{ "--item": item.color } as React.CSSProperties}><i>{owned ? item.icon : "?"}</i><div><strong>{item.name}</strong><small>{owned ? item.description : `스테이지 ${item.stageId} 보스 격파 보상`}</small><em>{used ? "사용 완료" : usable ? "지금 사용 가능" : owned ? item.timing : "미획득"}</em></div>{owned && !used && <button disabled={!usable} onClick={() => onUseItem(item.id)} type="button">사용하기</button>}</article>; })}</div><button onClick={() => setOpen(false)} type="button">닫기</button></section></div>}</div>;
}
function Fighter({ battle, image, label, showIntent = false, side }: { battle: BattleState; image: string; label: string; showIntent?: boolean; side: "hero" | "boss" }) {
  const bossIdentity = stages.find((stage) => stage.bossName === label);
  const displayTitle = side === "hero" ? characters.find((character) => character.name === label)?.role ?? "탐험가" : bossIdentity?.bossTitle ?? "던전 보스";
  const displayName = side === "hero" ? label : bossIdentity?.bossShortName ?? label;
  const hp = side === "hero" ? battle.playerHp : battle.bossHp;
  const max = side === "hero" ? battle.maxPlayerHp : battle.maxBossHp;
  const attackNotice = side === "boss" ? battle.attackNotice : undefined;
  const enemyAttack = side === "hero" ? battle.enemyAttackNotice : undefined;
  const bossAttack = side === "boss" ? battle.enemyAttackNotice : undefined;
  const quizDamage = side === "hero" ? battle.quizDamageNotice : undefined;
  const selfDamage = side === "hero" ? battle.selfDamageNotice : undefined;
  const wrongAnswer = side === "hero" && battle.phase === "reward" && battle.message.includes("오답");
  const bossConfused = side === "boss" && battle.bossEffect === "confusion";
  const confusionBurst = bossConfused && battle.phase === "action";
  const heroStance = battle.dodge ? "회피 준비" : battle.physicalShield ? "물리 방패 준비" : battle.magicGuard > 0 ? `마법 결계 +${battle.magicGuard}` : battle.attackBoost > 0 ? `공격 강화 +${battle.attackBoost}` : null;
  const bossStance = bossConfused ? "혼란" : battle.bossArmor > 0 ? `물리 방어 ${battle.bossArmor}` : battle.bossBarrier > 0 ? `마법 결계 ${battle.bossBarrier}` : battle.bossStance;
  return <article className={`fighter ${side} ${attackNotice ? `impact ${attackNotice.kind}-impact` : ""} ${side === "boss" && bossAttack ? `enemy-attacking ${bossAttack.kind}` : ""} ${side === "hero" && battle.playerEffect ? `player-effect ${battle.playerEffect}` : ""} ${wrongAnswer ? "wrong-answer" : ""} ${bossConfused ? "boss-confused" : ""} ${confusionBurst ? "confusion-burst" : ""}`}>
    <img alt={displayName} key={side === "boss" ? `boss-impact-${attackNotice?.sequence ?? 0}` : "hero"} src={image} />
    {side === "hero" && heroStance && <span className="fighter-stance hero-stance">{heroStance}</span>}
    {attackNotice && <><span aria-hidden="true" className={`boss-impact-flash ${attackNotice.kind}`} key={`flash-${attackNotice.sequence}`} /><div className={`battle-damage-pop ${attackNotice.kind}`} key={attackNotice.sequence}><strong>{attackNotice.defense > 0 ? attackNotice.brokeShield ? `${attackNotice.kind === "physical" ? "물리 방어막" : "마법 결계"} 파괴!` : `${attackNotice.kind === "physical" ? "물리 방어막" : "마법 결계"} -${attackNotice.shieldDamage}` : `${attackNotice.kind === "physical" ? "물리" : "마법"} 피해 ${attackNotice.damage}`}</strong>{attackNotice.defense > 0 && <small>{attackNotice.brokeShield ? `남은 피해 ${attackNotice.damage}` : `남은 내구도 ${attackNotice.shieldRemaining}`}</small>}</div></>}
    {enemyAttack && <div className={`battle-damage-pop ${enemyAttack.damage > 0 ? "player-hit" : "player-defense"} ${enemyAttack.kind}`} key={`${battle.round}-${enemyAttack.damage}-${enemyAttack.outcome ?? "hit"}`}><strong>{enemyAttack.damage > 0 ? `피해 ${enemyAttack.damage}` : enemyAttack.outcome === "dodge" ? "회피 성공!" : enemyAttack.outcome === "shield" ? "방패 방어!" : "방어 성공!"}</strong></div>}
    {quizDamage && <div className="battle-damage-pop player-hit physical" key={`quiz-${quizDamage}-${battle.score}`}><strong>피해 {quizDamage}</strong></div>}
    {selfDamage && <div className="battle-damage-pop self-hit" key={`self-${battle.round}-${selfDamage}-${battle.impactSequence}`}><strong>반동 피해 {selfDamage}</strong></div>}
    {wrongAnswer && <div className="wrong-pop">? ? ?</div>}
    {bossConfused && <div className="confusion-questions"><b>?</b><b>?</b><b>?</b></div>}
    <div className="fighter-name"><span className="fighter-title">{displayTitle}</span><strong>{displayName}</strong>{side === "boss" && showIntent && <small className="next-intent">다음 공격 · {battle.intent.label}</small>}{side === "boss" && <span className="fighter-stance boss-stance">{bossStance}</span>}<div className="hp-bar"><i style={{ width: `${Math.max(0, hp / max * 100)}%` }} /></div><div className="fighter-hp-row"><small>{hp} / {max}</small></div></div>
  </article>;
}
function QuizModal({ answered, battle, battleLog, difficulty, onAnswer, onContinueToAction, onMinimize, quiz }: { answered: QuizOption | null; battle: BattleState; battleLog: BattleLogEntry | undefined; difficulty: AdventureDifficulty; onAnswer: (option: QuizOption) => void; onContinueToAction: () => void; onMinimize: () => void; quiz: ReturnType<typeof generateStageQuiz> }) {
  const optionLayout = quiz.options.some((option) => option.text.length > 18) ? "long" : "short";
  const mirrorActive = battle.mirrorTurns > 0;
  const sealedHintId = battle.quizHint ? quiz.options.find((option) => !option.isCorrect)?.id : undefined;
  const quizDialogRef = useDialogKeyboard(true, onMinimize);
  return <div className="quiz-modal-backdrop"><section className={`quiz-modal ${optionLayout}`} role="dialog" aria-modal="true" aria-labelledby="quiz-title" ref={quizDialogRef}><header><p className="eyebrow">{getDifficulty(difficulty).badge} · QUIZ GATE</p><div><strong>정답 3 · 오답 2</strong>{!answered && <button className="quiz-minimize" onClick={onMinimize} type="button">전장 보기</button>}</div></header><h1 id="quiz-title">{quiz.prompt}</h1><p>{mirrorActive ? `진실의 거울 수정 효과 · 남은 ${battle.mirrorTurns}턴` : battle.quizHint ? "관문 수호의 수정 효과 · 오답 선택지 1개를 봉인했어요." : "일반 정답은 행동력 2, 숨겨진 럭키 정답은 행동력 3을 줍니다."}</p><div className={`quiz-options ${optionLayout}`}>{quiz.options.map((option) => { const hintSealed = option.id === sealedHintId; const sealed = (mirrorActive && option.isBomb) || hintSealed; const luckyMarked = mirrorActive && option.isLucky; return <button className={`${answered?.id === option.id ? option.isCorrect ? "correct" : "wrong" : ""} ${luckyMarked ? "lucky-revealed" : ""} ${sealed ? "bomb-sealed" : ""}`} disabled={Boolean(answered) || sealed} key={option.id} onClick={() => onAnswer(option)}>{luckyMarked && <small>🍀 럭키</small>}{hintSealed ? <small>🔒 제외</small> : sealed && <small>🔒 봉인</small>}{option.text}</button>; })}</div>{answered ? <div aria-live="polite" className={`quiz-feedback ${answered.isCorrect ? "correct" : "wrong"}`} role="status"><strong>{answered.isLucky ? "🍀 럭키팡 정답!" : answered.isCorrect ? "✓ 정답이에요!" : answered.isBomb ? "💣 폭탄 오답!" : "다시 확인해 봐요."}</strong><p>{answered.explanation}</p>{answered.misconception && <small>오개념 진단: {answered.misconception}</small>}{answered.isCorrect ? <button className="quiz-continue" onClick={onContinueToAction} type="button">전투로 이동 →</button> : <em>같은 문제를 다시 풀어 보세요…</em>}</div> : <aside className="quiz-rule" aria-label="최근 전투 기록"><b>최근 전투 기록</b>{battleLog ? <div><small>{formatBattleLogMeta(battleLog)}</small><strong>{battleLog.text}</strong>{battleLog.detail && <span>{battleLog.detail}</span>}</div> : <span>전투 기록이 아직 없습니다.</span>}</aside>}</section></div>;
}
function getCardRole(card: CombatCard) { return ({ attack: "공격", magic: "마법", defense: "수비", dodge: "회피", heal: "회복", strategy: "전략", boost: "강화" } as const)[card.role]; }
function getCardRoleColor(card: CombatCard) { return ({ attack: "coral", magic: "violet", defense: "cyan", dodge: "mint", heal: "cyan", strategy: "amber", boost: "coral" } as const)[card.role]; }
function ActionPanel({ battle, difficulty, onEndTurn, onPlayCard, onRedraw, preview = false }: { battle: BattleState; difficulty: AdventureDifficulty; onEndTurn: () => void; onPlayCard: (card: CombatCard) => void; onRedraw: () => void; preview?: boolean }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesDialogRef = useDialogKeyboard(rulesOpen, () => setRulesOpen(false));
  const showCardPreview = difficulty === "easy";
  return <section className={`action-panel ${preview ? "preview" : ""}`}><header><div className="hand-heading"><p>YOUR HAND · {battle.hand.length}/5 · 버림 {battle.discardCount}</p><strong>{preview ? "문제를 푸는 동안에는 손패를 확인만 할 수 있어요." : "행동력 안에서 공격·방어·회피·마법 카드를 조합하세요."}</strong></div><div className="action-controls"><button aria-haspopup="dialog" className="card-draw-rules" onClick={() => setRulesOpen(true)} type="button">☷ 카드 뽑기 규칙</button>{!preview && <><button className="redraw-button" disabled={battle.energy < 2} onClick={onRedraw}>↻ 새로 뽑기 <b>2</b></button><button onClick={onEndTurn}>{battle.bossHp <= 0 ? "승리 확인" : "턴 종료"} →</button></>}</div></header><div className="combat-hand">{battle.hand.map((card) => { const cardPreview = getCardPreview(battle, card); const ariaLabel = `${card.name}: 비용 ${card.cost}, ${getCardRole(card)}, ${card.description}${showCardPreview ? `. 예상 결과: ${cardPreview}` : ""}`; return <button aria-label={ariaLabel} className={getCardRoleColor(card)} disabled={preview || card.cost > battle.energy || battle.bossHp <= 0} key={card.instanceId} onClick={() => onPlayCard(card)}><span className="card-cost">{card.cost}</span><small className="card-role">{getCardRole(card)}</small><i aria-hidden="true">{card.symbol}</i><strong className="card-name">{card.name}</strong><em>{card.description}</em>{showCardPreview && <small className="card-preview">{cardPreview}</small>}</button>; })}</div>{rulesOpen && <div className="card-rules-backdrop" onMouseDown={() => setRulesOpen(false)}><section aria-labelledby="card-rules-title" aria-modal="true" className="card-rules-modal" onMouseDown={(event) => event.stopPropagation()} ref={rulesDialogRef} role="dialog"><header><div><p>CARD DRAW RULES</p><h2 id="card-rules-title">카드 뽑기 규칙</h2></div><button aria-label="카드 뽑기 규칙 닫기" onClick={() => setRulesOpen(false)} type="button">×</button></header><ol><li><b>1</b><div><strong>시작 손패 공격 보장</strong><span>시작할 때 공격 카드는 1~2장만 들어와요.</span></div></li><li><b>2</b><div><strong>정답 보상 드로우</strong><span>정답을 맞히면 빈 손패 자리에 카드 1장을 뽑아요.</span></div></li><li><b>3</b><div><strong>턴 시작 드로우</strong><span>턴이 시작될 때 손패가 3장 이하라면 카드 1장을 뽑아요.</span></div></li><li><b>4</b><div><strong>같은 카드 중복 제한</strong><span>같은 이름의 카드는 손에 1장만 뽑아요.</span></div></li></ol><button className="card-rules-close" onClick={() => setRulesOpen(false)} type="button">확인했어요</button></section></div>}</section>;
}
function Result({ earnedItem, earnedTitles, onNext, onSetup, score, stage, won }: { earnedItem: RewardItem | null; earnedTitles: AdventureTitle[]; onNext: () => void; onSetup: () => void; score: number; stage: (typeof stages)[number]; won: boolean }) { return <main className="result-page"><section><span className="result-icon">{won ? "✦" : "↻"}</span><p className="eyebrow">BOSS BATTLE RESULT</p><h1>{won ? `${stage.bossName} 격파!` : "집중력이 모두 소진됐어요"}</h1><p>{won ? `${stage.shortTitle}의 개념석을 되찾았습니다. 퀴즈로 얻은 행동력을 카드 전략으로 바꾸는 데 성공했어요.` : "개념 설명을 다시 확인하고 방어·회피 카드로 보스 행동에 대비해 보세요."}</p>{earnedItem && <div className="reward-item-earned" style={{ "--item": earnedItem.color } as React.CSSProperties}><i>{earnedItem.icon}</i><span><small>새 고유 수정 획득</small><strong>{earnedItem.name}</strong><em>{earnedItem.description}</em></span></div>}{earnedTitles.map((title) => { const titleDetail = getTitleDifficulty(title.difficulty); return <div className="earned-title" key={title.id} style={{ "--title-color": titleDetail.color } as React.CSSProperties}><i>{title.kind === "score" ? "✹" : titleDetail.mark}</i><span><small>새 칭호 획득 · {titleDetail.label}</small><strong>{title.name}</strong><em>{title.condition}</em></span></div>; })}<div className="result-score"><span>획득 점수</span><strong>{score}</strong></div><div className="result-actions"><button onClick={onNext}>{won ? stage.id === 5 ? "엔딩 보기" : "다음 구역" : "다시 도전"} →</button><button className="secondary" onClick={onSetup}>구역 선택</button></div></section></main>; }
function Ending({ onMain, score }: { onMain: () => void; score: number }) { return <main className="ending-page"><section><div className="ending-party"><img alt="클로버" src="/characters/clover.webp" /><img alt="셈별" src="/characters/saembyeol.webp" /><img alt="핀" src="/characters/pin.webp" /></div><p className="eyebrow">ADVENTURE COMPLETE</p><h1>수의 질서를 되찾았습니다!</h1><p>수의 범위를 판단하고 상황에 맞는 어림 방법과 카드 전략을 사용했습니다.</p><strong className="ending-title">칭호 · 수의 범위와 어림의 수호자</strong><small>마지막 전투 점수 {score}</small><button onClick={onMain}>메인 화면으로</button></section></main>; }
