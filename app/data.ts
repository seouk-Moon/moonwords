export type Sentence = {
  id: number;
  paragraph: number;
  english: string;
  korean: string;
};

export const paragraphs = [
  { id: 1, label: "충돌 사건", role: "사건 소개와 핵심 정보" },
  { id: 2, label: "과학 관측", role: "관측 결과와 성분 분석" },
  { id: 3, label: "원인과 경로", role: "달로 향하게 된 과정" },
  { id: 4, label: "더 넓은 문제", role: "우주 쓰레기와 과거 사례" },
  { id: 5, label: "미래 대응", role: "충돌 방지 계획" },
];

export const sentences: Sentence[] = [
  {
    id: 1,
    paragraph: 1,
    english:
      "A SpaceX rocket piece floating in space since last year smashed into the moon at high speed early Wednesday morning, joining the ranks of meteoroids, wayward spacecraft and other pieces of space junk that have bombarded the lunar surface for ages, astronomers confirmed.",
    korean:
      "천문학자들은 지난해부터 우주를 떠돌던 SpaceX 로켓 잔해가 수요일 새벽 빠른 속도로 달에 충돌했다고 확인했다. 이 잔해는 오랜 세월 달 표면을 강타해 온 유성체, 통제를 벗어난 우주선 및 기타 우주 쓰레기의 대열에 합류했다.",
  },
  {
    id: 2,
    paragraph: 1,
    english:
      "The school-bus-size object is the second stage of a SpaceX Falcon 9 rocket that had launched a lunar lander from Firefly Aerospace toward the moon in January 2025.",
    korean:
      "스쿨버스 크기의 이 물체는 2025년 1월 Firefly Aerospace의 달 착륙선을 달로 발사했던 SpaceX Falcon 9 로켓의 2단부이다.",
  },
  {
    id: 3,
    paragraph: 1,
    english:
      "Its predicted collision with the moon became a spectacle for astronomers and space enthusiasts eager to watch how it would unfold.",
    korean:
      "이 물체의 달 충돌이 예측되면서, 상황이 어떻게 전개될지 지켜보고 싶어 하는 천문학자와 우주 애호가들에게 큰 볼거리가 되었다.",
  },
  {
    id: 4,
    paragraph: 1,
    english:
      "Weighing 4 metric tons (4,000 kg), the rocket body slammed into the moon around 2:35 a.m. ET (0635 GMT), travelling at 5,400 miles per hour (8,690 kph).",
    korean:
      "무게가 4미터톤(4,000kg)인 이 로켓 본체는 시속 5,400마일(8,690km)의 속도로 이동하다가 미 동부 시간 오전 2시 35분경(GMT 06시 35분) 달에 충돌했다.",
  },
  {
    id: 5,
    paragraph: 1,
    english:
      "None of the few spacecraft orbiting the moon were positioned to capture close-up images of the impact.",
    korean:
      "달 궤도를 돌고 있던 몇 안 되는 우주선 중 충돌 장면을 가까이에서 촬영할 수 있는 위치에 있던 것은 하나도 없었다.",
  },
  {
    id: 6,
    paragraph: 2,
    english:
      "But at the Paranal Observatory in Chile, the European Southern Observatory's Very Large Telescope detected glimmers of light associated with the impact.",
    korean:
      "그러나 칠레의 파라날 천문대에서는 유럽남방천문대의 초거대망원경이 충돌과 관련된 희미한 빛을 감지했다.",
  },
  {
    id: 7,
    paragraph: 2,
    english:
      "“We can confirm that the telescope detected spectral lines of sodium and lithium gas in the impact plume lasting for 5–10 minutes after impact,” an ESO spokesperson told Reuters.",
    korean:
      "유럽남방천문대 대변인은 로이터에 ‘망원경이 충돌 후 5~10분 동안 지속된 충돌 분출물에서 나트륨과 리튬 가스의 스펙트럼 선을 감지했다는 사실을 확인할 수 있다’고 말했다.",
  },
  {
    id: 8,
    paragraph: 2,
    english:
      "The impact occurred near the moon's terminator line, or the boundary of its shadow between the sunlit side and its far side.",
    korean:
      "충돌은 달의 명암 경계선, 즉 햇빛이 비치는 면과 그 반대편 사이에 형성되는 그림자의 경계 부근에서 일어났다.",
  },
  {
    id: 9,
    paragraph: 2,
    english:
      "Similar to past objects that have hit the moon, the rocket stage kicked up a plume of lunar dust that was briefly illuminated by sunlight, but difficult to spot with the naked eye from Earth.",
    korean:
      "과거 달에 충돌했던 물체들과 마찬가지로, 이 로켓 단은 달 먼지 기둥을 일으켰다. 그 먼지는 잠시 햇빛을 받아 빛났지만 지구에서 맨눈으로 관찰하기는 어려웠다.",
  },
  {
    id: 10,
    paragraph: 2,
    english:
      "How the impact plume interacted with the sunlight allowed astronomers to glean clues about its composition.",
    korean:
      "충돌로 발생한 분출물이 햇빛과 상호작용하는 방식을 통해 천문학자들은 그 구성 성분에 관한 단서를 얻을 수 있었다.",
  },
  {
    id: 11,
    paragraph: 2,
    english:
      "The sodium gas evidenced in the spectra is believed to have originated from the lunar soil, while the traces of lithium may have come from the rocket stage itself, Carl Schmidt, the lead astronomer conducting the impact observations, told Reuters.",
    korean:
      "충돌 관측을 이끈 천문학자 Carl Schmidt는 로이터에 스펙트럼에서 확인된 나트륨 가스는 달 토양에서 나온 것으로 보이지만, 리튬의 흔적은 로켓 단 자체에서 나왔을 가능성이 있다고 말했다.",
  },
  {
    id: 12,
    paragraph: 2,
    english:
      "“This observation did not go perfectly and this is a very crude analysis, but I wanted to share something quickly, and we can say more about these results in time,” Schmidt said by email.",
    korean:
      "Schmidt는 이메일에서 ‘이번 관측은 완벽하게 진행되지 않았고 이것도 매우 개략적인 분석이지만, 무언가를 빨리 공유하고 싶었다. 시간이 지나면 이 결과에 관해 더 많은 이야기를 할 수 있을 것’이라고 말했다.",
  },
  {
    id: 13,
    paragraph: 3,
    english: "The impact was unintentional, SpaceX said.",
    korean: "SpaceX는 이번 충돌이 의도된 것이 아니었다고 밝혔다.",
  },
  {
    id: 14,
    paragraph: 3,
    english:
      "The rocket piece was expected to hit near Einstein Crater on the moon's western limb, which is often difficult to see from Earth.",
    korean:
      "로켓 잔해는 지구에서 관측하기 어려운 달 서쪽 가장자리의 아인슈타인 분화구 근처에 충돌할 것으로 예상되었다.",
  },
  {
    id: 15,
    paragraph: 3,
    english:
      "Such stages typically fall back into Earth's atmosphere and burn up or plunge into the ocean after boosting the rocket's payload to a precise spot in orbit.",
    korean:
      "이러한 로켓 단은 일반적으로 로켓의 탑재물을 궤도의 정확한 위치까지 밀어 올린 후 지구 대기권으로 다시 떨어져 타 버리거나 바다로 추락한다.",
  },
  {
    id: 16,
    paragraph: 3,
    english:
      "But because the January lunar lander mission required more thrust than missions closer to Earth, the rocket's second stage remained in space, floating aimlessly among thousands of other pieces of space junk that active satellites must steer clear of.",
    korean:
      "그러나 1월의 달 착륙선 임무에는 지구와 가까운 곳으로 향하는 임무보다 더 큰 추진력이 필요했기 때문에 로켓의 2단부가 우주에 남게 되었다. 그것은 운용 중인 위성들이 피해 다녀야 하는 수천 개의 다른 우주 쓰레기 사이를 목적 없이 떠돌았다.",
  },
  {
    id: 17,
    paragraph: 3,
    english:
      "It was not until earlier this year that astronomers determined that the rocket stage, which had dumped its remaining fuel and could not be controlled, was on an orbital trajectory ending at the moon.",
    korean:
      "천문학자들은 올해 초가 되어서야 잔여 연료를 버려 더 이상 통제할 수 없게 된 로켓 단이 결국 달에 도달하는 궤도를 따라가고 있다는 사실을 알아냈다.",
  },
  {
    id: 18,
    paragraph: 3,
    english:
      "“What has happened is essentially a mixture of solar activity and gravity forces have put it on a path toward the moon,” Julianna Scheiman, SpaceX director of NASA science and Dragon programs, told reporters on Monday.",
    korean:
      "SpaceX에서 NASA 과학 및 Dragon 프로그램을 담당하는 Julianna Scheiman 이사는 월요일 기자들에게 ‘본질적으로 태양 활동과 중력이 함께 작용해 그것을 달로 향하는 경로에 올려놓은 것’이라고 설명했다.",
  },
  {
    id: 19,
    paragraph: 3,
    english:
      "“This may be of some — probably minor — scientific interest, and we may learn some things from it,” said Bill Gray, creator of widely used astronomy software Project Pluto, who appeared first to calculate and publish a report predicting the stage's impact in April.",
    korean:
      "널리 사용되는 천문학 소프트웨어 Project Pluto의 개발자 Bill Gray는 ‘이것은 어느 정도, 아마도 미미하겠지만 과학적인 관심 가치가 있을 수 있으며, 우리는 이를 통해 몇 가지 사실을 알게 될지도 모른다’고 말했다. 그는 지난 4월 로켓 단의 충돌을 최초로 계산하고 예측 보고서를 발표한 사람으로 보인다.",
  },
  {
    id: 20,
    paragraph: 3,
    english:
      "“By January, I was pretty sure it would hit, though with only a vague idea as to where it would do so.”",
    korean:
      "‘1월에는 그것이 충돌할 것이라고 상당히 확신했지만, 정확히 어디에 충돌할지에 대해서는 막연하게만 알고 있었습니다.’",
  },
  {
    id: 21,
    paragraph: 3,
    english:
      "“By April, I was confident enough to post an announcement,” Gray said.",
    korean:
      "Gray는 ‘4월에는 공지를 올릴 수 있을 정도로 확신하게 되었습니다’라고 말했다.",
  },
  {
    id: 22,
    paragraph: 4,
    english:
      "Gray said that the impact presents no danger to anyone, “though it does highlight a certain carelessness about how leftover space hardware (space junk) is disposed of.”",
    korean:
      "Gray는 이번 충돌이 누구에게도 위험을 주지는 않지만, ‘남겨진 우주 장비, 즉 우주 쓰레기를 처리하는 방식에 어느 정도 부주의함이 있다는 사실을 분명히 보여 준다’고 말했다.",
  },
  {
    id: 23,
    paragraph: 4,
    english: "Space junk impacts on the moon are rare.",
    korean: "우주 쓰레기가 달에 충돌하는 일은 드물다.",
  },
  {
    id: 24,
    paragraph: 4,
    english:
      "A Chinese rocket stage crashed into the moon in March 2022 after completing a lunar test mission.",
    korean:
      "중국의 로켓 단이 달 시험 임무를 마친 후 2022년 3월 달에 충돌했다.",
  },
  {
    id: 25,
    paragraph: 4,
    english:
      "In 2009, NASA intentionally crashed a rocket stage into the moon to study the plume of lunar material kicked up by the impact, leading to a key discovery that lunar dirt contains traces of water ice.",
    korean:
      "2009년 NASA는 충돌로 솟아오르는 달 물질의 분출물을 연구하기 위해 의도적으로 로켓 단을 달에 충돌시켰다. 이 실험을 통해 달 토양에 물 얼음의 흔적이 들어 있다는 중요한 사실을 발견했다.",
  },
  {
    id: 26,
    paragraph: 4,
    english:
      "Several spacecraft intending to softly land on the moon in recent years have crashed instead.",
    korean:
      "최근 몇 년간 달에 연착륙하려 했던 여러 우주선이 연착륙에 실패하고 추락했다.",
  },
  {
    id: 27,
    paragraph: 4,
    english:
      "Russia's nuclear-powered Luna-25 mission spun out of control and crashed in 2023.",
    korean:
      "러시아의 원자력 동력 우주선 Luna-25는 통제 불능 상태에 빠져 2023년에 추락했다.",
  },
  {
    id: 28,
    paragraph: 4,
    english:
      "Its small power source of plutonium-238 likely remains harmlessly on the lunar surface.",
    korean:
      "Luna-25의 소형 플루토늄-238 동력원은 현재 달 표면에 해를 끼치지 않는 상태로 남아 있을 가능성이 크다.",
  },
  {
    id: 29,
    paragraph: 4,
    english: "India's Chandrayaan-2 lander mission crashed in 2019.",
    korean: "인도의 Chandrayaan-2 착륙선도 2019년에 추락했다.",
  },
  {
    id: 30,
    paragraph: 4,
    english: "Israel's Beresheet lander crashed that same year.",
    korean: "이스라엘의 Beresheet 착륙선도 같은 해에 추락했다.",
  },
  {
    id: 31,
    paragraph: 4,
    english:
      "Among the Israeli lander's payloads were tiny tardigrades, microscopic animals known for surviving radiation and other harsh environments and which may still be on the surface.",
    korean:
      "이스라엘 착륙선의 탑재물 중에는 방사선과 기타 가혹한 환경에서도 살아남는 것으로 알려진 현미경 크기의 작은 완보동물들이 있었으며, 이들은 아직도 달 표면에 남아 있을 가능성이 있다.",
  },
  {
    id: 32,
    paragraph: 4,
    english:
      "NASA intentionally crashed stages from its Saturn V moon rocket into the moon in the 1970s to study the impacts' seismic effects.",
    korean:
      "NASA는 충돌이 일으키는 지진학적 영향을 연구하기 위해 1970년대에 Saturn V 달 탐사 로켓의 여러 단을 의도적으로 달에 충돌시켰다.",
  },
  {
    id: 33,
    paragraph: 5,
    english:
      "NASA and SpaceX are discussing ways to prevent future lunar impacts, Scheiman said.",
    korean:
      "Scheiman은 NASA와 SpaceX가 앞으로 달 충돌을 방지할 방법을 논의하고 있다고 말했다.",
  },
  {
    id: 34,
    paragraph: 5,
    english:
      "The U.S. space agency plans to build a lunar base and send routine astronaut missions to the lunar surface beginning later this decade under its multibillion-dollar Artemis program.",
    korean:
      "미국 항공우주국 NASA는 수십억 달러 규모의 Artemis 프로그램에 따라 2020년대 후반부터 달 기지를 건설하고 우주비행사를 정기적으로 달 표면에 보낼 계획이다.",
  },
  {
    id: 35,
    paragraph: 5,
    english:
      "It would not want errant pieces of space junk impacting those assets.",
    korean:
      "NASA는 경로를 벗어난 우주 쓰레기 조각들이 그러한 달 기지와 우주 시설에 충돌하는 것을 원하지 않을 것이다.",
  },
];

export const meaningBank: Record<string, string> = {
  "space junk": "우주 쓰레기, 우주 폐기물",
  "joining the ranks of": "~의 대열에 합류하며",
  "school-bus-size": "스쿨버스 크기의",
  "second stage": "로켓의 2단부",
  "lunar lander": "달 착륙선",
  "close-up": "근접 촬영의",
  "spectral lines": "스펙트럼 선, 분광선",
  "impact plume": "충돌로 발생한 먼지·가스 기둥",
  "terminator line": "명암 경계선",
  "far side": "달의 반대편",
  "naked eye": "맨눈",
  "in time": "시간이 지나면, 머지않아",
  "western limb": "달의 서쪽 가장자리",
  "fall back": "다시 떨어지다",
  "burn up": "완전히 타 버리다",
  "plunge into": "~로 곤두박질치다",
  "steer clear of": "~을 피해 가다",
  "solar activity": "태양 활동",
  "gravity forces": "중력",
  "put it on a path": "그것을 경로에 올려놓다",
  "scientific interest": "과학적 가치 또는 관심",
  "vague idea": "막연한 생각",
  "disposed of": "처리된",
  "softly land": "연착륙하다",
  "spun out of control": "통제 불능 상태에 빠졌다",
  "power source": "동력원",
  "water ice": "물 얼음",
  "lunar base": "달 기지",
  "space agency": "우주 기관",
  "metric tons": "미터톤",
  piece: "조각; 이 글에서는 로켓 잔해",
  floating: "떠다니는, 표류하는",
  smashed: "세게 충돌했다",
  ranks: "대열",
  meteoroids: "유성체들",
  meteoroid: "유성체",
  wayward: "통제를 벗어난, 제멋대로 움직이는",
  spacecraft: "우주선",
  bombarded: "계속해서 강타했다",
  lunar: "달의",
  surface: "표면",
  ages: "아주 오랜 세월",
  astronomers: "천문학자들",
  confirmed: "확인했다",
  object: "물체",
  stage: "로켓의 단(段)",
  launched: "발사했다",
  toward: "~을 향하여",
  predicted: "예측된",
  collision: "충돌",
  spectacle: "큰 볼거리, 장관",
  enthusiasts: "열성적인 애호가들",
  eager: "간절히 바라는",
  unfold: "전개되다",
  weighing: "무게가 ~인",
  slammed: "세게 충돌했다",
  body: "로켓 본체",
  travelling: "이동하면서",
  orbiting: "궤도를 돌고 있는",
  positioned: "위치해 있는",
  capture: "포착하다, 촬영하다",
  impact: "충돌; 충돌의 영향",
  observatory: "천문대",
  telescope: "망원경",
  detected: "감지했다",
  glimmers: "희미한 빛들",
  associated: "관련된",
  sodium: "나트륨",
  lithium: "리튬",
  gas: "기체, 가스",
  plume: "기둥처럼 솟은 먼지·가스",
  lasting: "지속되는",
  spokesperson: "대변인",
  occurred: "발생했다",
  boundary: "경계",
  shadow: "그림자",
  sunlit: "햇빛이 비치는",
  similar: "비슷한",
  briefly: "잠시",
  illuminated: "빛을 받은, 밝혀진",
  spot: "발견하다; 지점",
  interacted: "상호작용했다",
  glean: "정보·단서를 조금씩 얻다",
  clues: "단서들",
  composition: "구성 성분",
  evidenced: "확인된, 입증된",
  spectra: "스펙트럼들",
  originated: "비롯되었다",
  soil: "토양",
  traces: "미량의 흔적",
  conducting: "수행하고 있는",
  observations: "관측",
  crude: "개략적인, 정교하지 않은",
  analysis: "분석",
  results: "결과",
  unintentional: "의도하지 않은",
  expected: "예상된",
  crater: "분화구",
  limb: "천체의 가장자리",
  typically: "일반적으로",
  atmosphere: "대기권",
  boosting: "밀어 올리는",
  payload: "탑재물",
  precise: "정확한",
  orbit: "궤도",
  required: "필요로 했다",
  thrust: "추진력",
  remained: "남아 있었다",
  aimlessly: "목적 없이",
  active: "운용 중인",
  satellites: "위성들",
  determined: "알아냈다, 판단했다",
  dumped: "버렸다, 방출했다",
  remaining: "남아 있는",
  fuel: "연료",
  controlled: "통제된",
  orbital: "궤도의",
  trajectory: "궤적, 이동 경로",
  essentially: "본질적으로",
  mixture: "혼합, 결합",
  forces: "힘들; 여기서는 중력",
  minor: "미미한, 중요하지 않은",
  interest: "관심; 여기서는 과학적 가치",
  creator: "개발자, 창작자",
  widely: "널리",
  calculate: "계산하다",
  publish: "발표하다, 출판하다",
  report: "보고서",
  predicting: "예측하는",
  confident: "확신하는",
  announcement: "발표, 공지",
  danger: "위험",
  highlight: "분명히 보여 주다, 강조하다",
  certain: "어느 정도의; 확실한",
  carelessness: "부주의함",
  leftover: "남겨진",
  hardware: "장비",
  rare: "드문",
  completing: "완료한 후",
  intentionally: "의도적으로",
  material: "물질",
  discovery: "발견",
  dirt: "흙; 여기서는 달 토양",
  contains: "포함한다",
  intending: "~하려는",
  instead: "대신에; 예상과 달리",
  "nuclear-powered": "원자력 동력의",
  harmlessly: "해를 끼치지 않는 상태로",
  likely: "아마도, 가능성이 큰",
  payloads: "탑재물들",
  tardigrades: "완보동물, 물곰",
  microscopic: "현미경으로 보아야 할 만큼 작은",
  surviving: "살아남는",
  radiation: "방사선",
  harsh: "가혹한",
  environments: "환경들",
  seismic: "지진의, 지진학적인",
  effects: "영향들",
  discussing: "논의하고 있는",
  prevent: "방지하다",
  future: "미래의, 앞으로의",
  routine: "정기적인",
  astronaut: "우주비행사",
  decade: "10년; 여기서는 2020년대",
  "multibillion-dollar": "수십억 달러 규모의",
  errant: "경로를 벗어난",
  assets: "중요 시설과 자산",
  impacting: "충돌하는, 영향을 주는",
};

export const recommendedWords = [
  "wayward",
  "spectacle",
  "glimmers",
  "plume",
  "glean",
  "trajectory",
  "carelessness",
  "tardigrades",
];

export const comprehensionQuestions = [
  {
    question: "이 글의 전체 전개 방식으로 가장 알맞은 것은?",
    options: [
      "문제 → 해결책 → 또 다른 문제 → 결론",
      "사건 → 과학적 관측 → 원인과 과정 → 더 넓은 우려와 과거 사례 → 미래 대응",
      "의견 → 근거 → 반론 → 결론",
      "과학 이론 → 실험 → 결과 → 평가",
    ],
    answer: 1,
    explanation:
      "충돌 사건에서 출발해 관측 결과, 원인, 우주 쓰레기 문제, 미래 대책으로 범위를 넓힙니다.",
  },
  {
    question: "로켓 2단부가 우주에 남게 된 직접적인 이유는?",
    options: [
      "통신 장비가 고장 났기 때문에",
      "달 착륙선 임무에 더 큰 추진력이 필요했기 때문에",
      "NASA가 달 충돌을 지시했기 때문에",
      "천문학자들이 관측을 요청했기 때문에",
    ],
    answer: 1,
    explanation:
      "지구 가까운 임무보다 더 큰 추진력이 필요했고, 그 결과 2단부가 일반적인 귀환 경로를 벗어나 우주에 남았습니다.",
  },
  {
    question: "관측된 리튬의 흔적은 어디에서 나왔을 가능성이 있는가?",
    options: ["태양", "달 토양", "로켓 단 자체", "지구 대기"],
    answer: 2,
    explanation:
      "나트륨은 달 토양, 리튬은 로켓 단 자체에서 왔을 가능성이 있다고 분석했습니다.",
  },
  {
    question: "필자가 과거의 여러 달 추락 사례를 제시한 주된 이유는?",
    options: [
      "국가별 우주 기술 순위를 매기기 위해",
      "Falcon 9의 성능을 홍보하기 위해",
      "달 충돌의 전례와 우주 쓰레기 관리 문제를 보여 주기 위해",
      "달에 생명체가 있음을 증명하기 위해",
    ],
    answer: 2,
    explanation:
      "과거 사례들은 이번 사건을 더 넓은 우주 쓰레기 관리와 달 안전 문제로 확장합니다.",
  },
  {
    question: "마지막 문단에서 Artemis 프로그램을 언급한 이유는?",
    options: [
      "Falcon 9의 발사 과정을 설명하려고",
      "통제되지 않은 달 충돌 방지가 더 중요해지는 이유를 보여 주려고",
      "새로운 달 실험을 소개하려고",
      "NASA와 SpaceX의 로켓 가격을 비교하려고",
    ],
    answer: 1,
    explanation:
      "향후 달 기지와 정기 유인 임무가 늘어나면 우주 쓰레기가 실제 시설과 인력을 위협할 수 있기 때문입니다.",
  },
];
