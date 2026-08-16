# TouchCatch: 와우 포인트 정의와 역동성 개선 계획

작성 2026-08-13. 대상은 남녀노소 일반 이용자이며, 주간 랭킹은 필수 요건에서 제외되었다.

---

## 1. 결론 먼저

이 게임의 와우 포인트는 **"학습"도 "펫"도 아니다.**

> **관찰이 곧 힌트다.** 차이점 하나를 찾을 때마다 정답 글자가 한 칸 열리고,
> 다 찾기 전에 답을 추리해 낼 수 있다.

`ㅂㅁㅇ ㅂ___`만 보고 "백문이 불여일견"을 떠올리는 순간 — 이 문서는 이걸
**추리 점프(deduction jump)** 라 부른다. 이게 다른 어떤 앱에도 없는 감정이다.

문제는 이 감정이 **지금 제품 어디에도 광고되지 않는다**는 것이다. 홈 화면은
"그림을 찾고 단어를 잡아보세요"라고만 말하고, 신규 이용자는 차이점을 찾아야
글자가 열린다는 사실을 첫 판을 절반쯤 지나서야 눈치챈다.

---

## 2. 제시하신 두 가설 검증

### 2.1 "게임이지만 학습도 된다" — 기제로는 최강, 포지셔닝으로는 최악

교육 게임 연구에는 **초콜릿 코팅 브로콜리(chocolate-covered broccoli)** 라는
2001년 Brenda Laurel이 만든 용어가 있다. 재미없는 학습(브로콜리) 위에 포인트와
보상(초콜릿)을 얹는 설계를 말한다. 연구가 일관되게 지적하는 실패 원인은 하나다.

- 이용자는 "초콜릿"과 "브로콜리"의 **단절을 정확히 알아챈다**
- 그 결과 학습 동기를 오히려 **떨어뜨린다**. "공부 파트는 지루한 것,
  재미 파트로 가기 위해 치르는 대가"라고 가르치게 된다
- 좋은 교육 게임의 조건은 **"배우는 것과 노는 것이 동시에 일어나는 것"**

여기서 TouchCatch가 특이하다. 국내 속담·사자성어 앱은 전부 **"뜻 읽고 → 보기 고르기"**
구조다. 게임과 학습이 다른 방에 있다. 반면 우리 구조는 차이점을 찾는 **행위 자체가**
정답 글자를 구매한다. 브로콜리와 초콜릿이 분리 자체가 불가능하다.

**그래서 결론은 갈린다.**

| | 판정 |
| --- | --- |
| 기제(mechanic)로서 | **유지하고 전면에 내세운다.** 이게 유일한 방어 가능한 차별점이다 |
| 마케팅 문구로서 | **버린다.** "학습도 됩니다"는 브로콜리를 자백하는 문장이다 |

참고로 Duolingo조차 자사 제품 매니저가 목표를 "이용자가 재미있게 상호작용하고
**학습은 부산물로** 따라오는 것"이라고 표현한다. 학습을 앞세우지 않는다.

### 2.2 "높은 등급 펫 자랑" — 지금 구조로는 성립하지 않는다

자랑에는 **자랑할 대상**이 필요하다. 가챠 플렉스가 작동하는 이유는 Reddit·X·트위치에
이미 보고 있는 커뮤니티가 있고, 확률을 아는 사람들 사이에서만 "1뽑 전설"이 의미를
갖기 때문이다. 신규 앱에는 그 관중석이 비어 있다.

여기에 우리 고유의 제약이 두 개 더 겹친다.

1. **`ECON-012`가 현금 결제를 금지한다.** 가챠 자랑의 가치는 상당 부분 "저 사람이 얼마를
   태웠나"라는 희소성 신호에서 온다. 결제가 없으면 그 신호가 없다.
2. **하루 1회 무료 뽑기.** 전설이 나와도 그건 **운의 증거**지 **실력의 증거**가 아니다.
   운 자랑은 한 번은 통하지만 반복되지 않는다.

**그래서 방향을 틀어야 한다.** 펫을 없애자는 게 아니라, 펫의 **획득 사유**를 바꾼다.

> 전설 펫이 "운 좋았다"가 아니라 **"이 사람 5개만 찾고 맞혔다"** 를 뜻하게 만든다.

그러면 펫은 복권이 아니라 **트로피**가 된다. 트로피는 관중석이 없어도 자랑이 된다.
본인에게 의미가 있기 때문이다.

---

## 3. 시장 현실 (냉정하게)

2026년 캐주얼 게임 리텐션 벤치마크는 이렇다.

| 구간 | 수치 |
| --- | --- |
| D1 | 26% |
| D7 | 10% |
| D30 | **4% 미만** |

그리고 순수 하이퍼캐주얼은 구조적 하락, **메타 레이어를 얹은 하이브리드 캐주얼은
매출 37% 성장**이다. 업계 분석의 결론은 "경쟁 우위는 CPI 차익이 아니라
**메타 게임플레이 차별화**"라는 것이다.

두 가지 함의:

- **첫 세션 90초 안에 와우가 터져야 한다.** D1에서 이미 74%가 사라진다
- 펫 컬렉션(메타 레이어) 방향 자체는 시장과 맞다. 다만 §2.2대로 획득 사유를 고쳐야 한다

유사 하이브리드도 이미 있다 — Word Photo Connect, WordPix 같은 "사진 보고 단어 맞히기".
**다만 성격이 다르다.** 그쪽은 그림이 정답을 *묘사*한다. 우리는 그림이 정답과 무관하고,
*찾는 행위*가 글자를 산다. 정직하게 말하면 이 차이를 이용자가 즉시 이해하긴 어렵고,
그래서 §4.1과 §4.4가 중요하다.

---

## 4. 개선 계획 — 효과/비용 순

### 4.1 결과 공유 그리드 (효과 최상 · 비용 최소) ★1순위

Wordle을 바이럴로 만든 건 퍼즐이 아니라 **공유 포맷**이었다. 정답을 노출하지 않는
이모지 격자. 심지어 이 아이디어는 개발자가 아니라 이용자(Elizabeth S)가 손으로 만들어
쓰던 걸 Josh Wardle이 제품에 넣은 것이다.

우리 게임에 이걸 옮기면, **§2.2의 자랑 문제가 소셜 그래프 없이 풀린다.**

```
TouchCatch #142 · 속담
🔍🔍🔍🔍 ⚡
⬛⬛⬛⬜⬜⬜⬜  4/10 · 187점
```

- 🔍 = 정답 전까지 찾은 차이점 수
- ⚡ = 추리 점프로 조기 정답 / 🏁 = 전부 찾고 정답
- 정답 단어는 절대 노출하지 않는다

**핵심은 "적게 찾고 맞힐수록 멋있다"** 는 것이다. 노가다 자랑의 정반대이고,
그래서 정직하다. 그리고 이 격자 한 장이 게임의 기제를 자동으로 설명한다.

### 4.2 하루 한 판 공통 문제 (효과 상 · 비용 중) ★2순위

전원이 같은 판을 푼다. 공유 그리드가 **비교 가능해지는** 순간 대화가 생긴다.
주간 랭킹처럼 서버 검증 매치가 필요 없고, 스트릭 압박도 없다.

> Duolingo 스트릭 비판을 반면교사로 삼는다. 스트릭은 강력하지만 "학습보다 스트릭
> 유지를 우선하는 강박"을 만들고, Duolingo는 스트릭 복구를 유료화해 그 불안을
> 수익화한다. 우리는 **끊겨도 죄책감을 주지 않는** 형태로만 쓴다.

### 4.3 연출 강화 — 글자가 날아와 꽂히는 순간 (효과 상 · 비용 하) ★3순위

캐주얼 퍼즐의 교본은 Peggle이다. PopCap의 Matthew Johnson은 중독성의 핵심을
"시간에 걸쳐 스탯을 쌓는 게 아니라 **지금 이 순간 기분 좋고 소리가 멋진 것**"이라 했다.

지금 우리 피드백은 원형 펄스 하나뿐이다. 최소한 이만큼은 필요하다.

1. **찾은 지점에서 글자가 튀어나와 상단 패턴 칸으로 날아가 꽂힌다** ← 가장 중요
2. 착지 시 그 칸이 튕기고(scale 1 → 1.3 → 1) 짧은 효과음
3. 미발견 칸은 아주 미세하게 흔들려 "여기 아직 남았다"를 알림

1번은 단순한 장식이 아니다. **1초짜리 애니메이션 하나로 "차이점 = 글자"라는
게임의 정체성을 가르친다.** §3에서 지적한 "즉시 이해하기 어렵다"는 문제의 해법이다.

### 4.4 첫 판을 튜토리얼이 아니라 시연으로 (효과 상 · 비용 중)

D1 26%를 감안하면 설명할 시간이 없다. 텍스트 튜토리얼 대신:

- 첫 판은 차이점 3개짜리 짧은 판
- 첫 발견 직후 화면을 0.5초 멈추고 글자가 날아가 꽂히는 걸 **보여준다**
- 두 번째 발견 후 조기 입력창이 열리며 "이제 맞힐 수 있어요"

### 4.5 펫을 실력의 증거로 (효과 중상 · 비용 상)

§2.2의 구조적 수정. 하루 1회 무료 뽑기는 유지하되, **상위 등급은 조건 획득**으로 옮긴다.

| 조건 | 보상 |
| --- | --- |
| 차이점 5개 이하로 정답 | 희귀 이상 확정 |
| 힌트 0회로 정답 | 승급 재료 |
| 데일리 공통 문제 정답 | 그날의 한정 펫(기간 압박 없이, 이후에도 획득 가능) |

펫 카드에 **획득 사유를 새긴다** — "4개 찾고 맞힘 · 8월 13일". 이게 있어야 트로피다.

### 4.6 비동기 고스트 대결 (효과 중 · 비용 상)

주간 랭킹을 빼기로 한 자리에 넣을 후보. Super Auto Pets의 아레나가 실시간 매칭 없이
다른 이용자의 "스냅샷"과 붙이는 방식으로 이걸 해낸다.

같은 판을 푼 다른 사람의 발견 순서를 **고스트 마커**로 재생한다. 상대가 3번째
차이점을 찾은 시점에 내 화면에 표시가 뜬다. 서버 검증 매치가 필요 없고 — 기록은
"랭킹 점수"가 아니라 "리플레이"라서 조작돼도 남에게 피해가 없다.

---

## 5. 하지 말아야 할 것

| 항목 | 이유 |
| --- | --- |
| 스트릭 + 상실 압박 | Duolingo식 강박 유발. 전 연령 대상에서 특히 나쁘다 |
| 기간 한정 배너 | 재미가 아니라 마감이 접속 이유가 된다 |
| "학습 앱" 마케팅 | §2.1. 브로콜리를 자백하는 문장 |
| 등급만으로 연출 강도 배분 | 일반 등급을 모으는 대다수 세션이 매번 실패처럼 느껴진다 |
| 클라이언트 점수를 그대로 랭킹에 전송 | 조작 가능. 랭킹을 하려면 서버 검증이 선행돼야 한다 |

---

## 6. 권고 순서

1. **4.3 연출** — 가장 싸고, 게임의 정체성을 즉시 전달한다
2. **4.1 공유 그리드** — 자랑 욕구를 소셜 그래프 없이 해결
3. **4.4 첫 판 시연** — D1 방어
4. **4.2 데일리 공통 문제** — 공유 그리드를 비교 가능하게 만들어 1·2를 증폭
5. **4.5 펫 조건 획득** — 메타 레이어를 운에서 실력으로 전환
6. **4.6 고스트** — 위가 다 되고 나서

1~3번은 서버 변경이 없다. 4번부터 콘텐츠 파이프라인과 서버가 관여한다.

---

## 7. 출처

- Chocolate-covered broccoli: [Tedium](https://tedium.co/2019/05/09/edutainment-math-blaster-chocolate-covered-broccoli/), [Edutopia](https://www.edutopia.org/blog/serious-games-not-chocolate-broccoli-matthew-farber), [Nicky Case](https://blog.ncase.me/curse-of-the-chocolate-covered-broccoli-or-emotion-in-learning/)
- Wordle 공유 그리드: [Slate 인터뷰](https://slate.com/culture/2022/01/wordle-game-creator-wardle-twitter-scores-strategy-stats.html), [Smithsonian](https://www.smithsonianmag.com/smart-news/heres-why-the-word-game-wordle-went-viral-180979439/), [원 트윗](https://x.com/powerlanguish/status/1471493886031773707)
- 가챠 플렉스 심리: [Blue Archive](https://bluearchive.gg/gacha-pulls-and-the-psychology-of-chasing-rare-banners/), [CJ Dyas](https://www.cjdyas.design/blog/the-user-experience-of-gacha-games)
- 2026 캐주얼 시장·리텐션: [Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2026/2/2/state-of-mobile-2026), [Game Growth Advisor](https://gamegrowthadvisor.com/blog/2026-04-16-hybrid-casual-game-design-strategy-2026/), [Gamesforum](https://www.globalgamesforum.com/features/state-of-gaming-heres-what-the-mobile-data-actually-says)
- 게임 주스: [Design The Game](https://www.designthegame.com/learning/tutorial/how-tactile-interactions-game-juice-drive-player-engagement), [Resprawn](https://resprawn.medium.com/when-you-play-a-great-game-it-feels-good-d23761b6eccf)
- Duolingo 스트릭 비판: [Gad Allon](https://gadallon.substack.com/p/duolingos-scaling-journey-education), [Oulu 대학 논문](https://oulurepo.oulu.fi/bitstream/handle/10024/54117/nbnfioulu-202502121605.pdf?sequence=1&isAllowed=y)
- 비동기 고스트: [Wayline](https://www.wayline.io/blog/asynchronous-multiplayer-reclaiming-time-mobile-gaming), [Game Rant](https://gamerant.com/best-asynchronous-multiplayer-games/)
- 국내 유사 앱: [속담 퀴즈](https://play.google.com/store/apps/details?id=com.wonyapps.proverb&hl=ko), [사자성어 퀴즈](https://play.google.com/store/apps/details?id=com.wonyapps.fouridioms&hl=ko), [사픽](https://apps.apple.com/us/app/%EC%82%AC%ED%94%BD-%EC%82%AC%EC%9E%90%EC%84%B1%EC%96%B4-%ED%80%B4%EC%A6%88/id6747324308)
- 유사 하이브리드: [WordPix](https://play.google.com/store/apps/details?id=app.wordpix.android&hl=en_US), [Word Photo Connect](https://play.google.com/store/apps/details?id=com.epicpandagames.word.image.connect&hl=en_US)
