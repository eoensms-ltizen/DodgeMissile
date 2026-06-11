# DodgeMissile MVP 0

실시간 멀티플레이 환경 검증용 최소 프로젝트입니다.

현재 단계의 목표는 게임 재미 검증이 아니라, 여러 브라우저와 모바일 기기가 같은 WebSocket 서버에 접속해서 서버 권위 위치와 Ghost 상태를 실시간으로 공유하는지 확인하는 것입니다.

## 포함 기능

- PC: WASD / 방향키 이동
- 모바일: 가상 조이스틱 이동
- 서버 권위 이동 처리
- WebSocket으로 전체 플레이어 위치 동기화
- Space / 모바일 버튼으로 5초 Ghost 모드
- Ghost 쿨타임 15초
- 같은 서버에 접속한 모든 유저를 원형 캐릭터로 표시
- WebSocket 연결 종료 후 자동 재연결

## 요구 사항

- Node.js 20 LTS 이상 권장
- npm

## 로컬 실행 순서

### 1. 서버 실행

```bash
cd server
npm install
npm run dev
```

기본 서버 주소:

```text
ws://localhost:8080
```

### 2. 클라이언트 실행

새 터미널에서:

```bash
cd client
npm install
npm run dev
```

브라우저에서 표시된 Vite 주소로 접속합니다.

### 3. PC에서 멀티 접속 확인

같은 브라우저에서 탭 2개를 열거나, 서로 다른 브라우저 2개로 Vite 주소에 접속합니다.

확인할 것:

- 두 클라이언트에 서로의 원형 플레이어가 보이는지
- WASD와 방향키 이동이 다른 클라이언트에도 반영되는지
- Space 입력 시 Ghost 상태가 다른 클라이언트에도 보이는지
- 탭을 닫으면 다른 클라이언트에서 해당 플레이어가 제거되는지

## 같은 Wi-Fi 모바일 테스트

1. PC와 모바일을 같은 Wi-Fi에 연결합니다.
2. PC에서 서버와 클라이언트를 모두 실행합니다.
3. Vite가 출력하는 Network 주소를 모바일 브라우저에서 엽니다.

예시:

```text
http://192.168.0.10:5173
```

클라이언트는 기본적으로 `ws://현재호스트:8080`으로 WebSocket 연결을 시도합니다. 따라서 모바일에서 `http://PC_IP:5173`으로 접속하면 서버도 `ws://PC_IP:8080`으로 연결됩니다.

Windows 방화벽이 연결을 막는 경우, 같은 네트워크에서 TCP 5173번과 8080번 포트를 허용해야 합니다.

## 외부 서버에 붙이고 싶을 때

클라이언트 실행 시 환경변수를 지정합니다.

```bash
VITE_WS_URL=wss://your-server-url npm run dev
```

또는 배포 환경에 `VITE_WS_URL`을 설정하세요.

PowerShell에서는 다음처럼 지정할 수 있습니다.

```powershell
$env:VITE_WS_URL="wss://your-server-url"; npm run dev
```

## 배포 추천

- Client: GitHub Pages / Cloudflare Pages / Netlify
- Server: Render / Fly.io / Railway / VPS

GitHub Pages는 정적 클라이언트만 배포할 수 있습니다. WebSocket 서버는 Render, Fly.io, Railway, VPS 같은 별도 서버 환경에 배포해야 합니다.

## 검증 체크리스트

- PC 브라우저 2개에서 서로 보이는가
- 휴대폰 브라우저에서도 접속되는가
- WASD / 방향키 이동이 되는가
- 모바일 조이스틱 이동이 되는가
- Ghost 버튼/Space 입력이 다른 유저에게도 반영되는가
- 서버 재시작 후 재접속 가능한가

## 다음 작업 순서

멀티 접속 검증이 끝나기 전에는 미사일 기능을 붙이지 않습니다.

권장 순서:

1. 서버와 클라이언트 install/build/dev 검증
2. PC 탭 2개 동시 접속 테스트
3. 같은 Wi-Fi 모바일 접속 테스트
4. remote player interpolation 추가
5. 이후 미사일 엔티티와 충돌 처리 추가
