# GPS CHAT

GPS 기반 실시간 채팅 애플리케이션입니다. 근처 500m 내의 사용자들과 실시간으로 대화할 수 있습니다.

## 주요 기능

- 🌍 **GPS 기반 위치 서비스**: 근처 500m 내 사용자 검색
- 💬 **실시간 채팅**: Socket.IO를 이용한 실시간 메시지 전송
- 🔒 **프라이빗 채팅방**: 6자리 코드로 비공개 채팅방 생성/참가
- 📱 **반응형 디자인**: 모바일과 데스크톱에서 모두 사용 가능
- 📍 **위치 기반 필터링**: 근처 사용자만 메시지 수신
- 🗳️ **방 삭제 투표**: 프라이빗 방 삭제 시 과반수 동의 필요

## 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time**: Socket.IO
- **Database**: SQLite3
- **Hosting**: Render

## 로컬 개발 환경 설정

1. **저장소 클론**
   ```bash
   git clone <repository-url>
   cd gps-chat
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **개발 서버 실행**
   ```bash
   npm run dev
   ```

4. **브라우저에서 접속**
   ```
   http://localhost:3000
   ```

## Render 배포 방법

### 1. GitHub 저장소 준비

1. 코드를 GitHub 저장소에 푸시합니다.
2. 모든 파일이 올바르게 커밋되었는지 확인합니다.

### 2. Render 계정 생성 및 서비스 연결

1. [Render.com](https://render.com)에 가입합니다.
2. "New +" 버튼을 클릭하고 "Web Service"를 선택합니다.
3. GitHub 저장소를 연결합니다.

### 3. 서비스 설정

**기본 설정:**
- **Name**: `gps-chat` (원하는 이름)
- **Environment**: `Node`
- **Region**: `Oregon (US West)` (가장 빠른 지역 선택)
- **Branch**: `main` (또는 기본 브랜치)

**빌드 설정:**
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**환경 변수:**
- `NODE_ENV`: `production`

### 4. 배포 완료

1. "Create Web Service"를 클릭합니다.
2. 배포가 완료될 때까지 기다립니다 (약 2-3분).
3. 제공된 URL로 접속하여 테스트합니다.

## 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `PORT` | 서버 포트 | `3000` |
| `NODE_ENV` | 실행 환경 | `development` |

## API 엔드포인트

- `GET /` - 메인 페이지
- `GET /health` - 헬스 체크

## Socket.IO 이벤트

### 클라이언트 → 서버
- `register` - 사용자 등록
- `sendMessage` - 메시지 전송
- `updateLocation` - 위치 업데이트
- `createPrivateRoom` - 프라이빗 방 생성
- `joinPrivateRoom` - 프라이빗 방 참가
- `leavePrivateRoom` - 프라이빗 방 나가기

### 서버 → 클라이언트
- `userJoined` - 새 사용자 입장 알림
- `userLeft` - 사용자 퇴장 알림
- `newMessage` - 새 메시지 수신
- `nearbyUsers` - 근처 사용자 목록

## 라이선스

MIT License

## 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

