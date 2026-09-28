export type StageId = 1 | 2 | 3 | 4 | 5;
export type Speaker = "셈별" | "주인공" | "보스";
export type DialogueChoice = { text: string; correct: boolean; feedback: string };
export type DialogueMultiOption = { id: string; text: string; isAnswer: boolean; explanation: string };
export type DialogueMultiCheck = { instruction: string; options: DialogueMultiOption[]; successFeedback: string };
export type DialogueNode = { speaker: Speaker; text: string; choices?: DialogueChoice[]; multiCheck?: DialogueMultiCheck };
export type Stage = { id: StageId; title: string; shortTitle: string; concept: string; mission: string; bossName: string; bossTitle: string; bossShortName: string; color: string; background: string; bossImage: string; dialogue: DialogueNode[] };

const choice = (correctText: string, wrong: string[], feedback: string, wrongFeedback: string): DialogueChoice[] => {
  const choices = [{ text: correctText, correct: true, feedback }, ...wrong.map((text) => ({ text, correct: false, feedback: wrongFeedback }))];
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  return choices;
};

const multiCheck = (options: DialogueMultiOption[], successFeedback: string): DialogueMultiCheck => {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return { instruction: "조건에 맞는 수를 모두 고르세요. 정답은 2개 이상입니다.", options: shuffled, successFeedback };
};

export const stages: Stage[] = [
  {
    id: 1, title: "범위의 숲, 뒤섞인 관문", shortTitle: "이상·이하", concept: "~와 같거나 큰 수, ~와 같거나 작은 수",
    mission: "관문의 끝 수 포함 도장을 뒤집은 범위 장난 도깨비 테라를 막고 숲길의 규칙을 바로 세우세요.", bossName: "범위 장난 도깨비 테라", bossTitle: "범위 장난 도깨비", bossShortName: "테라", color: "#65f29a",
    background: "/story-backgrounds/stage-1-boundary-forest-v2.webp", bossImage: "/characters/boss-stage-1-terra.webp",
    dialogue: [
      { speaker: "주인공", text: "180 이상 입구에서 180번 등불정령이 튕겨 나왔어! 테라가 끝 수를 포함하는 도장을 떼 버린 모양이야." },
      { speaker: "보스", text: "크하하! 180 이상 입구에서는 180을 빼고, 145 이하 귀환문에서도 145를 빼 버렸지. 여행자들은 숲길을 헤매게 될 거야!" },
      { speaker: "셈별", text: "테라가 두 관문의 끝 수 도장을 뒤집었어요. 먼저 180 이상 입구를 바로잡아 볼까요?" },
      { speaker: "셈별", text: "‘180 이상’은 180과 같거나 큰 수예요. 180도 포함돼요." },
      { speaker: "셈별", text: "180 이상인 수를 모두 고르세요.", multiCheck: multiCheck([{ id: "179", text: "179", isAnswer: false, explanation: "179는 180보다 작으므로 ‘180 이상’에 포함되지 않아요." }, { id: "180", text: "180", isAnswer: true, explanation: "180은 ‘이상’의 끝 수라서 포함돼요." }, { id: "181", text: "181", isAnswer: true, explanation: "181은 180보다 크므로 범위 안에 있어요." }, { id: "194", text: "194", isAnswer: true, explanation: "194는 180보다 크므로 범위 안에 있어요." }, { id: "195", text: "195", isAnswer: true, explanation: "195도 180보다 크므로 범위 안에 있어요." }], "맞아요! ‘180 이상’은 180과 같거나 큰 수이므로 180, 181, 194, 195가 정답이에요.") },
      { speaker: "주인공", text: "입구의 빛이 돌아왔어! 이제 145번 여행자가 막힌 귀환문을 고치자." },
      { speaker: "셈별", text: "‘145 이하’는 145와 같거나 작은 수예요. 145도 포함돼요." },
      { speaker: "셈별", text: "132 이상 145 이하인 수를 모두 고르세요.", multiCheck: multiCheck([{ id: "131", text: "131", isAnswer: false, explanation: "131은 132보다 작으므로 범위 밖이에요." }, { id: "132", text: "132", isAnswer: true, explanation: "132는 ‘이상’의 끝 수라서 포함돼요." }, { id: "140", text: "140", isAnswer: true, explanation: "140은 132와 145 사이에 있으므로 범위 안에 있어요." }, { id: "145", text: "145", isAnswer: true, explanation: "145는 ‘이하’의 끝 수라서 포함돼요." }, { id: "146", text: "146", isAnswer: false, explanation: "146은 145보다 크므로 범위 밖이에요." }], "맞아요! ‘이상’과 ‘이하’는 양 끝 수를 모두 포함하므로 132, 140, 145가 정답이에요.") },
      { speaker: "보스", text: "범위를 읽다니! 하지만 숲의 문은 내가 다시 뒤섞어 주겠다!" },
    ],
  },
  {
    id: 2, title: "안개 협곡, 범위의 함정", shortTitle: "초과·미만", concept: "~보다 큰 수와 ~보다 작은 수",
    mission: "110과 64를 억지로 포함시키는 우기기 용 바르카를 물리치고 협곡의 다리를 되찾으세요.", bossName: "우기기 용 바르카", bossTitle: "우기기 용", bossShortName: "바르카", color: "#56d9ff",
    background: "/story-backgrounds/stage-2-mist-ravine-v2.webp", bossImage: "/characters/boss-stage-2-varka.webp",
    dialogue: [
      { speaker: "주인공", text: "떠 있는 다리가 안개 속으로 사라지고 있어. 바르카가 발판 규칙을 자기 마음대로 바꿨어!" },
      { speaker: "보스", text: "안개 다리의 안전 발판 표시를 전부 바꿔 버렸다! 110 초과인데도 110을 밟게 하고, 64 미만인데도 숫자 64가 적힌 발판을 안전하다고 표시할 거야!" },
      { speaker: "셈별", text: "바르카의 말은 맞지 않아요. ‘110 초과’는 110보다 큰 수예요. 110은 110보다 크지 않으므로 포함되지 않아요." },
      { speaker: "셈별", text: "110 초과 116 이하인 수를 모두 고르세요.", multiCheck: multiCheck([{ id: "110", text: "110", isAnswer: false, explanation: "110은 ‘초과’의 끝 수라서 포함되지 않아요." }, { id: "111", text: "111", isAnswer: true, explanation: "111은 110보다 크고 116보다 작아서 범위 안에 있어요." }, { id: "115", text: "115", isAnswer: true, explanation: "115는 두 기준 수 사이에 있으므로 범위 안에 있어요." }, { id: "116", text: "116", isAnswer: true, explanation: "116은 ‘이하’의 끝 수라서 포함돼요." }, { id: "117", text: "117", isAnswer: false, explanation: "117은 116보다 크므로 범위 밖이에요." }], "맞아요! ‘110 초과’에서는 110을 빼고, ‘116 이하’에서는 116을 넣으므로 111, 115, 116이 정답이에요.") },
      { speaker: "주인공", text: "바르카가 우긴 발판이 사라졌어! 하지만 반대쪽에서도 또 억지를 부리고 있어." },
      { speaker: "보스", text: "64 미만이면 64도 넣어도 돼! 아주 조금만 봐주면 되잖아!" },
      { speaker: "셈별", text: "그것도 맞지 않아요. ‘64 미만’은 64보다 작은 수예요. 64는 64보다 작지 않으므로 포함되지 않아요." },
      { speaker: "셈별", text: "58 초과 64 미만인 수를 모두 고르세요.", multiCheck: multiCheck([{ id: "58", text: "58", isAnswer: false, explanation: "58은 ‘초과’의 끝 수라서 포함되지 않아요." }, { id: "59", text: "59", isAnswer: true, explanation: "59는 58보다 크고 64보다 작아서 범위 안에 있어요." }, { id: "60", text: "60", isAnswer: true, explanation: "60은 두 기준 수 사이에 있으므로 범위 안에 있어요." }, { id: "63", text: "63", isAnswer: true, explanation: "63은 64보다 작으므로 범위 안에 있어요." }, { id: "64", text: "64", isAnswer: false, explanation: "64는 ‘미만’의 끝 수라서 포함되지 않아요." }], "맞아요! ‘초과’와 ‘미만’은 양 끝 수를 모두 제외하므로 59, 60, 63이 정답이에요.") },
      { speaker: "보스", text: "으으, 말이 안 통해도 내가 맞아! 내 폭풍 속에서 다시 우겨 주지!" },
    ],
  },
  {
    id: 3, title: "태엽 대장간, 뒤집힌 어림", shortTitle: "올림·버림", concept: "목적에 따라 수를 올리거나 버려 어림하기",
    mission: "상황과 관계없이 올림과 버림을 쓰는 마구 어림 골렘 톱니를 멈추고 대장간을 안정시키세요.", bossName: "마구 어림 골렘 톱니", bossTitle: "마구 어림 골렘", bossShortName: "톱니", color: "#ffcc4d",
    background: "/story-backgrounds/stage-3-forge-cavern-v2.webp", bossImage: "/characters/boss-stage-3-forge.webp",
    dialogue: [
      { speaker: "주인공", text: "대장간의 불꽃 관문이 열리지 않아! 톱니가 필요한 상자 수를 작게 세서 불꽃이 남았어." },
      { speaker: "보스", text: "불꽃 132개를 담을 상자는 모자라게 만들고, 광석 378개는 남은 78개까지 꽉 찬 수레 한 대로 세겠어! 올림과 버림을 마구 섞으면 대장간은 멈추지!" },
      { speaker: "셈별", text: "필요한 만큼을 빠짐없이 준비할 때는 올림을 써요. 먼저 불꽃 관문을 고쳐 볼게요." },
      { speaker: "셈별", text: "올림은 구하려는 자리 아래에 0이 아닌 수가 있으면 구하려는 자리의 수를 1 크게 하고, 아래 자리는 모두 0으로 나타내는 방법이에요. 243을 올림하여 십의 자리까지 나타내면 250이에요." },
      { speaker: "셈별", text: "132개의 불꽃을 10개씩 상자에 모두 담으려면 최소 몇 상자가 필요할까요? 상자에 들어가지 못한 불꽃이 하나라도 있으면 안 돼요.", choices: choice("14상자", ["13상자", "12상자", "15상자", "132상자"], "맞아요! 남은 2개도 담아야 하므로 132를 올림하여 십의 자리까지 나타내면 140, 즉 14상자가 필요해요.", "남은 불꽃도 하나도 빠지면 안 돼요. 필요한 수가 조금 남으면 상자를 하나 더 준비해야 해요.") },
      { speaker: "주인공", text: "불꽃 관문은 열렸어! 하지만 톱니가 광석 수레 수를 부풀려 태엽 레일도 멈추게 하려 해." },
      { speaker: "셈별", text: "버림은 구하려는 자리의 아래 수를 버려서 나타내는 방법이에요. 228을 버림하여 백의 자리까지 나타내면 200이에요." },
      { speaker: "셈별", text: "378을 버림하여 백의 자리까지 나타내면 무엇일까요?", choices: choice("300", ["400", "370", "380", "3"], "정답! 십의 자리와 일의 자리인 78을 버리면 300이에요.", "버림하여 백의 자리까지 나타낼 때는 백의 자리 아래의 십의 자리와 일의 자리를 버려요.") },
      { speaker: "보스", text: "어림의 불꽃은 내 것이다! 내 거대한 망치 앞에서 무너져라!" },
    ],
  },
  {
    id: 4, title: "별빛 관측탑, 반올림의 거울", shortTitle: "반올림", concept: "바로 아래 자리의 숫자를 보고 하는 반올림",
    mission: "반올림할 때 구하려는 자리 바로 아래 자리의 숫자를 엉뚱하게 보게 하는 엉뚱 자리 마녀 미라주를 물리치세요.", bossName: "엉뚱 자리 마녀 미라주", bossTitle: "엉뚱 자리 마녀", bossShortName: "미라주", color: "#ff7eb6",
    background: "/story-backgrounds/stage-4-crystal-observatory-v2.webp", bossImage: "/characters/boss-stage-4-mirage.webp",
    dialogue: [
      { speaker: "주인공", text: "관측탑의 별빛 표지판이 595를 590으로 비추고 있어! 미라주가 길잡이 별을 엉뚱한 탑으로 보내고 있나 봐." },
      { speaker: "보스", text: "그래! 595의 일의 자리 5를 4처럼 보이게 했지. 반올림하여 십의 자리까지 나타내도 590이라고 믿게 될 거야!" },
      { speaker: "셈별", text: "미라주는 반올림할 때 확인해야 하는 바로 아래 자리를 바꿔 보이고 있어요. 진짜 일의 자리 5를 확인해 표지판을 바로잡아요." },
      { speaker: "셈별", text: "구하려는 자리 바로 아래 자리의 숫자가 0, 1, 2, 3, 4이면 버리고, 5, 6, 7, 8, 9이면 올려요. 3482를 반올림하여 십의 자리까지 나타내면 3480이에요." },
      { speaker: "셈별", text: "595를 반올림하여 십의 자리까지 나타내면 무엇일까요?", choices: choice("600", ["590", "595", "610", "500"], "맞아요! 일의 자리 5를 보고 십의 자리를 올리면 600이에요.", "반올림하여 십의 자리까지 나타낼 때는 일의 자리 5를 확인해요. 5 이상이면 십의 자리를 올려요.") },
      { speaker: "주인공", text: "거울 한 장이 제자리로 돌아왔어. 더 큰 자리에서도 확인할 숫자는 바로 아래 자리겠지?" },
      { speaker: "셈별", text: "맞아요. 1472를 반올림하여 백의 자리까지 나타낼 때는 십의 자리 숫자 7을 확인해요. 7은 5, 6, 7, 8, 9 중 하나이므로 백의 자리를 올려요." },
      { speaker: "셈별", text: "1450을 반올림하여 백의 자리까지 나타내면 무엇일까요?", choices: choice("1500", ["1400", "1450", "1600", "1300"], "정답! 십의 자리 5를 보고 백의 자리를 올리면 1500이에요.", "반올림하여 백의 자리까지 나타낼 때는 십의 자리 5를 확인해요. 5 이상이면 백의 자리를 올려요.") },
      { speaker: "보스", text: "가까운 길을 찾아냈군. 하지만 내 거울은 네 용기도 뒤집을 수 있다!" },
    ],
  },
  {
    id: 5, title: "하늘성, 흔들리는 다섯 봉인", shortTitle: "종합 적용", concept: "수의 범위와 올림·버림·반올림 중 알맞은 방법 고르기",
    mission: "모든 수 규칙을 뒤섞은 규칙 도둑 리밋을 물리치고 하늘성의 균형을 되찾으세요.", bossName: "규칙 도둑 리밋", bossTitle: "규칙 도둑", bossShortName: "리밋", color: "#b78cff",
    background: "/story-backgrounds/stage-5-sky-castle-v2.webp", bossImage: "/characters/boss-stage-5-limit.webp",
    dialogue: [
      { speaker: "주인공", text: "하늘성의 다섯 봉인이 모두 흔들리고 있어. 테라와 바르카, 톱니, 미라주가 남긴 규칙 조각을 리밋이 봉인에 끼워 넣었어!" },
      { speaker: "보스", text: "나는 봉인마다 다른 규칙을 섞어 놓았다! 범위의 끝점을 바꾸고, 모두 담아야 할 상자에는 버림을, 꽉 찬 상자에는 올림을 쓰게 만들었지!" },
      { speaker: "셈별", text: "규칙 도둑 리밋은 수의 범위와 어림을 섞어 판단을 흐려요. 먼저 범위의 끝 수부터 정확히 확인해요." },
      { speaker: "셈별", text: "‘8 이상 14 미만’은 8은 포함하고 14는 포함하지 않아요." },
      { speaker: "셈별", text: "8 이상 14 미만인 자연수를 모두 고르세요.", multiCheck: multiCheck([{ id: "7", text: "7", isAnswer: false, explanation: "7은 8보다 작으므로 범위 밖이에요." }, { id: "8", text: "8", isAnswer: true, explanation: "8은 ‘이상’의 끝 수라서 포함돼요." }, { id: "10", text: "10", isAnswer: true, explanation: "10은 8보다 크고 14보다 작아서 범위 안에 있어요." }, { id: "13", text: "13", isAnswer: true, explanation: "13은 14보다 작으므로 범위 안에 있어요." }, { id: "14", text: "14", isAnswer: false, explanation: "14는 ‘미만’의 끝 수라서 포함되지 않아요." }], "맞아요! 8은 포함하고 14는 포함하지 않으므로 8, 10, 13이 정답이에요.") },
      { speaker: "주인공", text: "첫 봉인이 빛나기 시작했어. 다음 봉인은 어떤 어림 방법을 써야 할지 골라야 해!" },
      { speaker: "셈별", text: "3462개의 수정 구슬을 100개씩 상자에 모두 담으려면 최소 몇 개의 상자가 필요할까요? 이때 어떤 어림 방법을 사용해야 할까요?", choices: choice("올림", ["버림", "반올림"], "정답! 34상자에는 3400개만 담을 수 있어 남은 62개를 담을 상자가 하나 더 필요해요. 모두 담아야 하므로 3462를 올림하여 백의 자리까지 나타내면 3500이고, 상자 35개를 준비해야 해요.", "모두 담아야 하므로 남은 62개를 빼거나 가까운 수로 나타내면 안 돼요. 100개씩 담을 상자를 하나 더 준비하는 올림을 사용해야 해요.") },
      { speaker: "셈별", text: "반대로 2543개의 수정 중 100개씩 꽉 채운 상자만 만들려면 남는 수는 제외해요. 이때는 버림이 알맞아요." },
      { speaker: "셈별", text: "2543개로 100개씩 꽉 채운 상자는 최대 몇 개일까요?", choices: choice("25상자", ["24상자", "26상자", "30상자", "2543상자"], "맞아요! 2543을 버림하여 백의 자리까지 나타내면 2500, 즉 25상자예요.", "꽉 채운 상자만 세므로 남는 43개는 제외해요. 버림을 사용하세요.") },
      { speaker: "보스", text: "수의 범위와 어림을 모두 꿰뚫다니! 그렇다면 내 균형의 왕좌에서 마지막 승부를 내자!" },
    ],
  },
];

export type Character = { id: "clover" | "toto" | "pin"; name: string; role: string; image: string; physicalDefense: number; magicDefense: number };

export const characters: Character[] = [
  { id: "clover", name: "클로버", role: "수의 범위 수호기사", image: "/characters/clover-v3-final.webp", physicalDefense: 4, magicDefense: 0 },
  { id: "toto", name: "토토", role: "어림 탐색가", image: "/characters/toto-v2.png", physicalDefense: 2, magicDefense: 2 },
  { id: "pin", name: "핀", role: "반올림 성운 마도사", image: "/characters/pin-v3-final.webp", physicalDefense: 0, magicDefense: 4 },
];
