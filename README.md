# 🏠 퇴근 타이머 (Toigeun Timer)

고정시차출근제 기반 **퇴근까지 남은 시간**을 귀여운 캐릭터와 함께 보여주는 macOS 데스크톱 앱 (Electron).

- 시차 **A** `08:30~18:00` · 시차 **B** `07:30~17:00` · 시차 **C** `09:30~19:00`
- 메뉴바(트레이)에 `🐹 3:24` 실시간 카운트다운, 퇴근 시각엔 네이티브 알림
- 햄스터 🐹 / 토끼 🐰 캐릭터가 **하루 진행도를 따라 집(🏡)으로 걸어감**
- **야근 수기입력** (+30분 / +1시간 / 직접입력) → 퇴근 목표가 연장되고, 목표를 지나면 자동으로 추가근무 시간을 카운트업
- **🐾 데스크톱 펫 모드**: 캐릭터가 *창 영역 없이* 바탕화면을 자유롭게 돌아다님

---

## 실행

```bash
npm install      # 최초 1회 (electron 설치)
npm start        # 앱 실행
npm run pet      # 데스크톱 펫 모드로 바로 실행
```

## 진짜 앱(.app)으로 만들기

```bash
npm run dist       # dist/mac/퇴근타이머.app  (서명 없는 폴더 빌드, 가장 빠름)
npm run dist:dmg   # 배포용 .dmg
```

빌드 후 `dist/mac/퇴근타이머.app`을 `응용 프로그램` 폴더로 옮기면 일반 앱처럼 더블클릭 실행됩니다.
(미서명 앱이라 첫 실행 시 *우클릭 → 열기* 한 번 필요)

---

## 사용법

| 동작 | 방법 |
|------|------|
| 시차 변경 | 상단 `A / B / C` 칩 클릭 |
| 캐릭터 변경 | 하단 `🐹 햄찌` / `🐰 토토` 버튼 |
| 야근 추가 | `+30분`, `+1시간`, 또는 분 직접입력 후 `추가` |
| 야근 초기화 | `초기화` (매일 자정 자동 초기화도 됨) |
| 항상 위 토글 | 상단 📌 |
| 트레이로 숨기기 | 상단 ✕ (앱은 계속 동작, 메뉴바에서 다시 열기) |
| 데스크톱 펫 | 상단 🐾 또는 메뉴바 트레이 메뉴 |
| 펫 끌어 옮기기 | 펫 위에서 마우스로 **드래그** (집었다 놓으면 통통 떨어짐) |
| 펫 쓰다듬기 | 펫을 **클릭** → 깡총 뛰며 💕 |
| 완전 종료 | 메뉴바 트레이 → `종료` |

선택한 시차·캐릭터·야근은 자동 저장됩니다
(`~/Library/Application Support/toigeun-timer/settings.json`).

### 캐릭터 상태 변화
- **근무 중**: 천천히 걸어다님
- **퇴근 10분 전**: 신나서 빨라짐 💨
- **퇴근!** (정시~2분): 점프하며 축하 🎉 + 네이티브 알림
- **추가 근무 중**: 지쳐서 느릿느릿 💤, 타이머는 `+MM:SS`로 카운트업

---

## 🐾 "창 없이 돌아다니는" 데스크톱 펫은 어떻게 만들까?

핵심은 **화면 전체를 덮는 투명·클릭통과(click-through) 오버레이 창** 하나입니다.
창 테두리·배경이 전혀 안 보이니, 그 위의 캐릭터만 바탕화면을 뛰어다니는 것처럼 보입니다. (`main.js`의 `createPet()`)

```js
const { bounds } = screen.getPrimaryDisplay();
petWin = new BrowserWindow({
  x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  transparent: true,   // 배경 투명 → 창이 안 보임
  frame: false,        // 타이틀바·테두리 제거
  hasShadow: false,
  focusable: false,    // 포커스 가로채지 않음
  skipTaskbar: true,
});
petWin.setIgnoreMouseEvents(true, { forward: true }); // ★ 클릭이 뒤 앱으로 통과
petWin.setAlwaysOnTop(true, 'screen-saver');          // 항상 최상단
petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // 모든 데스크톱/전체화면 위에도
```

포인트 4가지:
1. **`transparent: true` + `frame: false`** — 창의 모양 자체를 지워, 캐릭터만 떠 있게 만든다.
2. **`setIgnoreMouseEvents(true, …)`** — 오버레이가 마우스를 무시 → 클릭이 뒤의 실제 앱으로 통과한다. (이게 없으면 투명한 벽이 화면을 덮어버림)
3. **`setAlwaysOnTop(…, 'screen-saver')`** — 다른 창들 위에 항상 보인다.
4. **`setVisibleOnAllWorkspaces`** — 어느 데스크톱·전체화면에서도 따라다닌다.

캐릭터의 이동(배회·방향전환·점프)은 `renderer/pet.js`의 `requestAnimationFrame` 루프에서 좌표를 직접 갱신해 처리합니다. 목표 지점을 무작위로 정해 걸어가고, 도착하면 잠깐 쉬었다가 다시 새 목표를 정하는 단순한 배회 AI입니다.

### 마우스로 조작 (펫 드래그 & 쓰다듬기)

오버레이 전체는 클릭통과지만, **커서가 캐릭터 위에 올라오면** 그 순간만 창을 마우스 입력 가능 상태로 바꿔(`setIgnoreMouseEvents(false)`) 잡거나 클릭할 수 있게 합니다. 커서가 벗어나면 다시 클릭통과로 돌아가, 캐릭터만 "딱딱"하고 바탕화면 나머지는 그대로 클릭됩니다. (`pet.js`의 hover 감지 + `main.js`의 `pet-interactive` IPC)

- **드래그**: 잡으면 **놀란 표정(grab 포즈)**으로 바뀌고, 빠르게 흔들면 붙잡힌 듯 좌우로 흔들립니다. 높이 들었다 놓으면 중력으로 통통 떨어집니다.
- **클릭(쓰다듬기)**: 제자리에서 깡총 뛰며 `💕` 반응.
- **시간은 마우스 오버 시에만**: 평소엔 캐릭터만 돌아다니고, 커서를 올리면 말풍선으로 남은 시간을 보여줍니다.

#### 다양한 행동
돌아다니기(walk) → 두리번(idle) → 낮잠(sleep) 을 무작위로 반복하고, 퇴근 10분 전엔 신나서 빨라지고(happy), 퇴근하면 폴짝(happy), 야근엔 졸며 쉽니다(sleep). 각 행동마다 포즈 이미지(idle/happy/sleep/grab)가 바뀝니다.

> 펫을 끄려면 위젯의 🐾 또는 트레이 메뉴를 사용하세요.

---

## 캐릭터 아트 (진짜 3D 렌더)

`renderer/assets/hamster-3d.png`, `renderer/assets/rabbit-3d.png` — **Three.js로 만든 점토(클레이) 스타일 3D 모델**을 부드러운 스튜디오 조명으로 렌더링해 투명 PNG로 구워낸 이미지입니다. 깊이·하이라이트·반사가 살아있는 실제 3D 렌더라 통통 튀며 걸어다닐 때 입체감이 납니다.

```bash
npm run bake   # 3D 모델을 다시 렌더 → renderer/assets/*-3d.png 갱신
```

모델링·조명·카메라는 `scripts/bake-render.js`에서 구(sphere) 프리미티브 조합으로 정의합니다. 색·비율·표정을 바꾸고 다시 `npm run bake` 하면 됩니다. 새 캐릭터는 `makeXxx()` 함수를 추가하고 `renderer/timer-core.js`의 `CHARS`에 PNG 경로를 등록하세요. (벡터 버전 `*.svg`도 폴백용으로 남겨둠)

> 참고: 이 환경에는 호출 가능한 외부 이미지/3D 생성 AI(OpenAI/Gemini/Stability 등 API 키 없음, Figma MCP는 텍스트→이미지 미지원)가 없어, 외부 모델을 호출하는 대신 Three.js로 직접 3D를 렌더했습니다. DALL·E/Meshy 같은 외부 서비스 키가 있으면 같은 자리(`assets/*-3d.png`)에 결과물을 떨궈 교체할 수 있습니다.

---

## 시차 시간 커스터마이즈

`renderer/timer-core.js`의 `SHIFTS`만 고치면 됩니다.

```js
const SHIFTS = {
  A: { label: '시차 A', start: '08:30', end: '18:00' },
  B: { label: '시차 B', start: '07:30', end: '17:00' },
  C: { label: '시차 C', start: '09:30', end: '19:00' },
};
```

## 테스트

```bash
node scripts/test-core.js   # 카운트다운·야근·페이즈 로직 단위 테스트
```

## 구조

```
main.js                 Electron 메인 (창/트레이/알림/설정저장/펫 오버레이)
preload.js              contextBridge (렌더러 ↔ 메인 안전 통신)
renderer/
  timer-core.js         공유 타이머 로직 (위젯·펫 공용, Node에서 require 가능)
  index.html/style.css/app.js   타이머 위젯 UI
  pet.html/pet.css/pet.js       바탕화면 펫 오버레이
  assets/*.svg          캐릭터 아트
scripts/test-core.js    단위 테스트
```
