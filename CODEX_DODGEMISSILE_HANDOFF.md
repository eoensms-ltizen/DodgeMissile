# DodgeMissile MVP — Codex 작업 인수인계 문서

## 프로젝트 개요

`DodgeMissile`은 실시간 멀티플레이 기반의 미사일 피하기 `.io` 게임이다.

현재 목표는 게임 재미 검증이 아니라, **웹 브라우저 기반 실시간 멀티플레이 환경 검증**이다.

즉, 가장 먼저 확인해야 할 것은 다음이다.

```text
여러 사용자가 같은 서버에 접속한다.
각자 PC/모바일에서 입력한다.
서버가 위치를 계산한다.
모든 클라이언트가 서로의 위치와 Ghost 상태를 실시간으로 본다.
```

---

## 현재 MVP 패키지

이전 단계에서 생성된 ZIP:

```text
dodgemissile-mvp.zip
```

압축 해제 시 예상 구조:

```text
dodgemissile-mvp/
  README.md
  client/
    package.json
    tsconfig.json
    index.html
    src/
      main.ts
      style.css
  server/
    package.json
    tsconfig.json
    src/
      index.ts
```

---

## 현재 구현된 기능

### Client

기술 스택:

```text
Vite
TypeScript
PixiJS
```

기능:

```text
PC 이동:
- WASD
- 방향키

모바일 이동:
- 화면 좌하단 가상 조이스틱

Ghost:
- PC: Space
- 모바일: 우하단 GHOST 버튼

렌더링:
- 내 플레이어: 초록색 원
- 다른 플레이어: 빨간색 원
- Ghost 상태: 반투명/파란색 표현
- 플레이어 ID 표시
- 내 플레이어 기준 카메라 추적
```

환경변수:

```text
VITE_WS_URL
```

지정하지 않으면 기본값:

```text
ws://현재호스트:8080
```

---

### Server

기술 스택:

```text
Node.js
TypeScript
ws
```

기능:

```text
WebSocket 서버
단일 방
플레이어 접속/퇴장
입력 수신
서버 권위 위치 계산
Ghost 상태 처리
전체 플레이어 상태 브로드캐스트
```

기본 포트:

```text
8080
```

서버 Tick:

```text
30Hz
```

현재 서버 상태 구조:

```ts
type Player = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  input: {
    x: number;
    y: number;
    ghostPressed: boolean;
  };
  ghostUntil: number;
  ghostCooldownUntil: number;
  lastSeenAt: number;
};
```

Client → Server 입력:

```json
{
  "type": "input",
  "x": 0,
  "y": 0,
  "ghostPressed": false
}
```

Server → Client 상태:

```json
{
  "type": "state",
  "serverTime": 123456789,
  "players": [
    {
      "id": "P1",
      "x": 100,
      "y": 200,
      "vx": 0,
      "vy": 0,
      "ghost": false,
      "ghostRemainMs": 0,
      "ghostCooldownRemainMs": 0
    }
  ]
}
```

---

## 현재 게임 기획 확정 사항

### 게임명

```text
DodgeMissile
```

### 핵심 컨셉

```text
실시간 멀티플레이 미사일 피하기 .io 게임
```

### PC 조작

```text
WASD
방향키
```

마우스 조작은 사용하지 않는다.

### 모바일 조작

```text
가상 조이스틱
```

### 스킬

```text
Ghost Mode
```

현재 임시 스펙:

```text
지속시간: 5초
쿨타임: 15초
효과: 추후 미사일 충돌 무시
```

현재 MVP에서는 미사일이 없으므로, 상태 동기화와 시각 표현만 검증한다.

---

## 로컬 실행 방법

### Server

```bash
cd server
npm install
npm run dev
```

예상 로그:

```text
DodgeMissile server listening on ws://localhost:8080
```

### Client

다른 터미널에서:

```bash
cd client
npm install
npm run dev
```

브라우저에서 Vite 주소 접속.

---

## 외부 접속 테스트 방법

같은 Wi-Fi에서 모바일로 테스트할 경우:

1. PC의 로컬 IP 확인
2. 서버 실행
3. 클라이언트 실행
4. 모바일 브라우저에서 Vite가 표시한 Network 주소로 접속

예시:

```text
http://192.168.0.10:5173
```

단, 클라이언트가 서버에 붙을 때 `ws://location.hostname:8080`을 사용하므로, 모바일에서도 같은 PC의 8080 서버로 접속을 시도한다.

---

## 0차 검증 체크리스트

Codex가 우선적으로 확인해야 할 항목:

```text
[ ] server npm install 성공
[ ] server npm run dev 성공
[ ] client npm install 성공
[ ] client npm run dev 성공
[ ] PC 브라우저 탭 2개에서 서로 보임
[ ] WASD 이동 가능
[ ] 방향키 이동 가능
[ ] Space 입력 시 Ghost 상태 반영
[ ] 모바일 브라우저에서 접속 가능
[ ] 모바일 조이스틱 이동 가능
[ ] 모바일 Ghost 버튼 동작
[ ] 접속 종료 시 다른 클라이언트에서 제거됨
[ ] 서버 재시작 후 클라이언트 재접속 가능
```

---

## 가장 먼저 개선할 작업

### 1. README 보강

현재 README는 최소 설명만 있음.

추가하면 좋은 내용:

```text
- Node.js 권장 버전
- 로컬 테스트 방법
- 같은 Wi-Fi 모바일 테스트 방법
- Render/Fly.io 배포 방법
- GitHub Pages 배포 방법
```

---

### 2. 연결 상태 안정화

현재 클라이언트는 WebSocket close 시 1초 뒤 재연결한다.

개선 후보:

```text
- 재연결 backoff
- 중복 socket 생성 방지
- 재연결 중 입력 전송 차단
- 서버 재시작 후 world/players 상태 초기화
```

---

### 3. 부드러운 이동 보간

현재는 서버에서 받은 위치를 거의 그대로 그림.

개선 후보:

```text
- remote player interpolation
- 내 캐릭터 client-side prediction
- 서버 reconciliation은 아직 보류 가능
```

0차에서는 interpolation만 붙여도 충분하다.

---

### 4. 서버 상태 정리

현재는 단일 `index.ts`에 모든 로직이 들어 있다.

분리 후보:

```text
server/src/types.ts
server/src/game.ts
server/src/network.ts
```

단, 너무 빨리 구조화하지 말고 테스트가 통과한 뒤 진행한다.

---

### 5. 배포 준비

클라이언트:

```text
GitHub Pages
Cloudflare Pages
Netlify
```

서버:

```text
Render
Fly.io
Railway
VPS
```

주의:

```text
GitHub Pages는 WebSocket 서버를 실행할 수 없다.
클라이언트 정적 파일만 배포 가능하다.
서버는 별도 호스팅이 필요하다.
```

---

## 다음 기능 추가 순서

멀티 접속 검증 후에만 진행한다.

```text
1. 미사일 엔티티 추가
2. 미사일 서버 권위 이동
3. 미사일과 플레이어 충돌
4. Ghost 중 충돌 무시
5. 사망/리스폰
6. 점수
7. 근접 회피 점수
8. 미사일 어그로/타겟 변경
9. 3분 타임어택 모드
10. 랭킹 UI
```

---

## 미사일 1차 스펙 초안

아직 구현하지 말 것. 멀티 검증 이후 진행.

```ts
type Missile = {
  id: string;
  targetPlayerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  turnRate: number;
  lifeMs: number;
};
```

기본 동작:

```text
서버에서 생성
가장 가까운 플레이어를 타겟
매 tick마다 타겟 방향으로 회전
플레이어와 충돌하면 플레이어 사망
Ghost 상태 플레이어는 충돌 무시
수명 종료 또는 벽 충돌 시 제거
```

---

## 중요한 개발 원칙

### 서버 권위

클라이언트가 위치를 직접 보내면 안 된다.

나쁜 방식:

```json
{
  "x": 120,
  "y": 300
}
```

좋은 방식:

```json
{
  "inputX": 1,
  "inputY": 0
}
```

서버가 최종 위치를 계산해야 한다.

---

### 먼저 검증, 나중에 예쁘게

현재 단계에서는 아트 리소스, UI 퀄리티, 사운드보다 네트워크 검증이 중요하다.

우선순위:

```text
1. 접속된다
2. 같이 보인다
3. 움직인다
4. 끊겨도 복구된다
5. 모바일에서도 된다
```

---

### 복잡한 방 시스템은 아직 금지

초기에는 단일 방으로 충분하다.

아직 하지 말 것:

```text
매칭
방 목록
계정
스킨
상점
친구 초대
랭킹 서버
DB
```

---

## 알려진 한계

```text
- 서버가 메모리 상태만 사용한다.
- 방은 하나뿐이다.
- 보간/예측이 없다.
- 핑 측정이 없다.
- 미사일이 없다.
- 충돌/사망/점수가 없다.
- 보안/치트 방지는 최소 수준이다.
- HTTPS 배포 시 WebSocket은 wss://를 사용해야 한다.
```

---

## Codex에게 요청할 첫 작업 제안

가장 먼저 아래 순서대로 작업하는 것을 권장한다.

```text
1. 프로젝트 압축 해제
2. npm install / npm run dev 확인
3. 발생하는 타입/빌드 오류 수정
4. PC 탭 2개 동시 접속 테스트
5. 모바일 같은 Wi-Fi 접속 테스트 문서화
6. 연결 안정화와 README 보강
7. interpolation 추가
```

---

## 성공 기준

이번 단계의 성공 기준은 다음이다.

```text
브라우저 여러 개와 모바일에서 접속했을 때
동그라미 플레이어들이 같은 공간에서
끊김 없이 움직이고
Ghost 상태가 모든 클라이언트에 보이면 성공
```

이 기준을 만족하기 전에는 미사일 기능을 붙이지 않는다.
