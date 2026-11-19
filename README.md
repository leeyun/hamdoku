# 🐹 햄스터 찾기 퍼즐 (웹 멀티플레이)

최대 4명이 같은 퍼즐을 동시에 풀며 서로의 화면을 실시간으로 보는 웹 게임.

- 규칙: 색깔 영역마다 / 행·열마다 햄스터 1마리, 햄스터끼리는 대각선 포함 접촉 불가
- 조작: 클릭·드래그 = X 표시/지우기, 더블클릭(모바일 더블탭) = 햄스터 찾기
- 틀리면 해바라기씨(생명) -1, 3번 틀리면 탈락. 먼저 다 찾을수록 높은 순위·점수
- 구글 로그인, 초대 링크(`/r/방코드`), 친구 화면 LIVE(스포 방지 흐리게 옵션), 이모트, 채팅
- **클래식전 / 아이템전**: 아이템전은 황금 햄스터(12×12는 3마리, 나머지 2마리)를 찾으면
  무작위로 🙈 상대 한 명 화면 5초 가리기 또는 💡 햄스터 하나 알려주기
- **랭크**: 브론즈 → 실버 → 골드 → 플래티넘 → 에메랄드 → 다이아 해바라기씨(각 IV~I, 단계당 100 LP) → 마스터(2400) → 챌린저(3000)
  - 2명 이상이 함께한 판만 반영. 등수별 LP(4명: +35/+15/−5/−20), 판 크기 배율(6×6 ×0.6 ~ 12×12 ×1.5), 무실수 완료 +5
  - 낮은 티어는 더 많이 오르고 덜 떨어짐. 규칙 상세는 `rank.js`
- **햄스터 아바타 + 상점**: 다 찾으면 남은 해바라기씨(생명)가 코인으로 쌓임 (랭크 1등 +2, 3명 이상일 때 2등 +1, 첫 가입 5개)
  - 모자 / 옷 / 등날개 각 5종 (`public/catalog.js`에서 가격 수정, 그림은 `public/avatar.js`)
  - 햄스터를 찾으면 내 아바타와 친구 아바타가 "앗싸!" 몸짓

## 실행

```bash
npm install
cp .env.example .env   # 값 채우기
npm start              # http://localhost:3000
```

## Google 로그인 설정

1. https://console.cloud.google.com/apis/credentials → **사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션**
2. **승인된 JavaScript 원본**에 추가
   - `https://<내-도메인>.ngrok-free.app`
   - `http://localhost:3000` (로컬 테스트용)
3. 발급된 클라이언트 ID를 `.env`의 `GOOGLE_CLIENT_ID`에 넣기
4. `SESSION_SECRET`에 아무 긴 문자열 넣기 (재시작해도 로그인 유지)

`GOOGLE_CLIENT_ID`가 비어 있으면 닉네임 게스트 입장만 됩니다. 구글 로그인과 게스트를 같이 쓰려면 `ALLOW_GUEST=true`.

## ngrok

```bash
ngrok config add-authtoken <토큰>          # 최초 1회
ngrok http 3000 --url=<내-도메인>.ngrok-free.app
```

초대 링크는 접속한 주소 기준으로 만들어지므로 ngrok 주소로 들어가서 방을 만들면 `https://<내-도메인>.ngrok-free.app/r/ABC123` 형태로 복사됩니다.
무료 ngrok은 처음 접속할 때 경고 페이지가 한 번 나오는데 **Visit Site**를 누르면 됩니다.

## 구조

| 파일 | 역할 |
|---|---|
| `server.js` | Express + Socket.IO, 로그인 토큰, 방/게임 상태 (정답은 서버에만 보관) |
| `puzzle.js` | 정답이 유일한 퍼즐 생성기 |
| `public/app.js` | 화면, 보드 조작(드래그/더블클릭), 실시간 친구 화면 |
| `public/hamster.js` | 햄스터·해바라기씨 SVG |
| `public/sound.js` | Web Audio 합성 효과음 |
| `rank.js` | 티어/LP 계산, `data/ranks.json`에 저장 |
| `profile.js` | 코인·보유 아이템·착용 정보, `data/profiles.json`에 저장 |
| `public/catalog.js` | 상점 아이템 목록 (서버·브라우저 공용) |
| `public/avatar.js` | 전신 햄스터 아바타와 아이템 SVG, 몸짓 |

방·채팅 데이터는 메모리에 저장되어 서버를 재시작하면 사라집니다. 랭크는 `data/ranks.json`에 남습니다
(다른 위치를 쓰려면 `RANK_FILE` 환경변수). 게스트 계정은 브라우저 로그인이 유지되는 동안만 같은 랭크를 이어갑니다.
