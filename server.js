const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 프라이빗 방 관련 변수
const privateRooms = new Map(); // roomCode -> { users: Set, messages: Array, createdAt: Date, creator: socketId }
const userRooms = new Map(); // socketId -> roomCode
const roomDeletionVotes = new Map(); // roomCode -> { votes: Set, requiredVotes: number, initiator: socketId }

// Rate Limiting 관련 변수
const messageLimits = new Map(); // socketId -> { count: number, lastReset: Date }
const MAX_MESSAGES_PER_MINUTE = 30;
const MAX_USERNAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;

// 입력값 검증 함수
function validateInput(input, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof input !== 'string') return false;
  if (input.length > maxLength) return false;
  if (input.trim().length === 0) return false;
  // XSS 방지를 위한 기본 검증
  if (/<script|javascript:|on\w+=/i.test(input)) return false;
  return true;
}

// HTML 이스케이프 함수
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Rate Limiting 검사
function checkRateLimit(socketId) {
  const now = new Date();
  const userLimit = messageLimits.get(socketId);
  
  if (!userLimit) {
    messageLimits.set(socketId, { count: 1, lastReset: now });
    return true;
  }
  
  // 1분이 지나면 리셋
  if (now - userLimit.lastReset > 60000) {
    messageLimits.set(socketId, { count: 1, lastReset: now });
    return true;
  }
  
  if (userLimit.count >= MAX_MESSAGES_PER_MINUTE) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

// 모든 사용자에게 근처 사용자 리스트 업데이트
function updateAllUsersNearbyList() {
  console.log('🔄 모든 사용자에게 근처 사용자 리스트 업데이트 중...');
  
  connectedUsers.forEach((user, socketId) => {
    if (user.latitude && user.longitude) {
      const nearbyUsers = findNearbyUsers(user.latitude, user.longitude, socketId);
      io.to(socketId).emit('nearbyUsers', nearbyUsers);
      console.log(`📋 ${user.username}에게 ${nearbyUsers.length}명의 근처 사용자 목록 업데이트`);
    }
  });
}

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 정적 파일 서빙 설정
console.log('현재 디렉토리:', __dirname);

// 루트 디렉토리를 정적 파일 서빙으로 설정
app.use(express.static(__dirname));
console.log('✅ 루트 디렉토리를 정적 파일 서빙으로 설정했습니다.');

// 루트 경로 핸들러 추가
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  console.log('index.html 경로:', indexPath);
  
  // 파일 존재 여부 확인
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('index.html 파일을 찾을 수 없습니다:', indexPath);
    
    // 기본 HTML 생성
    const defaultHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPS 채팅</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .error { color: red; }
        .success { color: green; }
    </style>
</head>
<body>
    <h1>GPS 채팅</h1>
    <p class="error">index.html 파일을 찾을 수 없습니다.</p>
    <p>서버는 정상적으로 실행 중입니다.</p>
    <p class="success">헬스 체크: <a href="/health">/health</a></p>
</body>
</html>`;
    
    res.send(defaultHTML);
  }
});

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SQLite 데이터베이스 설정 (Render 환경 대응)
let db;
try {
  // Render에서는 임시 디렉토리 사용
  const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/chat.db' : './chat.db';
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.log('SQLite 데이터베이스 초기화 실패, 메모리 기반으로 전환:', err.message);
      db = null;
    } else {
      console.log('SQLite 데이터베이스에 성공적으로 연결되었습니다.');
      // 데이터베이스 초기화
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          socket_id TEXT UNIQUE,
          username TEXT,
          latitude REAL,
          longitude REAL,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.log('users 테이블 생성 오류:', err.message);
          } else {
            console.log('users 테이블이 준비되었습니다.');
          }
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id TEXT,
          sender_name TEXT,
          message TEXT,
          latitude REAL,
          longitude REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.log('messages 테이블 생성 오류:', err.message);
          } else {
            console.log('messages 테이블이 준비되었습니다.');
          }
        });
      });
    }
  });
} catch (error) {
  console.log('SQLite 데이터베이스 초기화 실패, 메모리 기반으로 전환:', error.message);
  db = null;
}

if (!db) {
  console.log('데이터베이스 없이 메모리 기반으로 실행됩니다.');
}

// 연결된 사용자들을 저장하는 객체
const connectedUsers = new Map();

// 두 지점 간의 거리 계산 (미터 단위) - Haversine 공식
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 지구 반지름 (미터)
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  
  // 거리 계산 결과 로깅 (디버깅용)
  if (distance < 1000) { // 1000m 이내일 때만 로깅 (500m 범위를 고려)
    console.log(`📏 거리 계산: (${lat1}, ${lon1}) ↔ (${lat2}, ${lon2}) = ${Math.round(distance)}m`);
  }
  
  return distance;
}

// 근처 사용자 찾기 (500m 이내)
function findNearbyUsers(latitude, longitude, excludeSocketId = null) {
  const nearbyUsers = [];
  
  console.log(`🔍 위치 (${latitude}, ${longitude})에서 근처 사용자 검색 중...`);
  console.log(`📊 현재 연결된 사용자 수: ${connectedUsers.size}`);
  
  connectedUsers.forEach((user, socketId) => {
    if (socketId !== excludeSocketId && user.latitude && user.longitude) {
      const distance = calculateDistance(latitude, longitude, user.latitude, user.longitude);
      console.log(`👤 ${user.username}: ${Math.round(distance)}m 거리`);
      
      if (distance <= 500) { // 500미터 이내
        nearbyUsers.push({
          socketId,
          username: user.username,
          distance: Math.round(distance),
          latitude: user.latitude,
          longitude: user.longitude
        });
        console.log(`✅ ${user.username} 추가됨 (${Math.round(distance)}m)`);
      }
    }
  });
  
  console.log(`🎯 총 ${nearbyUsers.length}명의 근처 사용자 발견`);
  return nearbyUsers;
}

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  console.log('새로운 사용자가 연결되었습니다:', socket.id);

  // 사용자 등록
  socket.on('register', (data) => {
    const { username, latitude, longitude } = data;
    
    // 입력값 검증
    if (!validateInput(username, MAX_USERNAME_LENGTH)) {
      socket.emit('error', { message: '유효하지 않은 사용자명입니다.' });
      return;
    }
    
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      socket.emit('error', { message: '유효하지 않은 위치 정보입니다.' });
      return;
    }
    
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      socket.emit('error', { message: '위치 정보가 범위를 벗어났습니다.' });
      return;
    }
    
    // 사용자명 이스케이프
    const sanitizedUsername = escapeHtml(username.trim());
    
    console.log(`\n🚀 새 사용자 등록: ${sanitizedUsername}`);
    console.log(`📍 위치: ${latitude}, ${longitude}`);
    console.log(`🆔 Socket ID: ${socket.id}`);
    
    connectedUsers.set(socket.id, {
      username,
      latitude,
      longitude,
      lastSeen: new Date()
    });

    // 데이터베이스에 사용자 정보 저장
    if (db) {
      db.run(
        'INSERT OR REPLACE INTO users (socket_id, username, latitude, longitude, last_seen) VALUES (?, ?, ?, ?, ?)',
        [socket.id, username, latitude, longitude, new Date().toISOString()]
      );
    }

    // 근처 사용자들에게 새 사용자 알림
    const nearbyUsers = findNearbyUsers(latitude, longitude, socket.id);
    
    if (nearbyUsers.length > 0) {
      console.log(`📢 ${nearbyUsers.length}명에게 새 사용자 알림 전송`);
      nearbyUsers.forEach(user => {
        console.log(`  → ${user.username}에게 알림 전송 (${user.distance}m)`);
        io.to(user.socketId).emit('userJoined', {
          socketId: socket.id,
          username,
          distance: user.distance
        });
      });
    } else {
      console.log(`⚠️ 근처에 다른 사용자가 없습니다.`);
    }

    // 새 사용자에게 근처 사용자 목록 전송
    socket.emit('nearbyUsers', nearbyUsers);
    console.log(`📋 ${username}에게 ${nearbyUsers.length}명의 근처 사용자 목록 전송`);
    
    // 새 사용자에게 최근 메시지 7개 전송
    if (db) {
      db.all(
        'SELECT * FROM messages WHERE timestamp > datetime("now", "-24 hours") ORDER BY timestamp DESC LIMIT 7',
        (err, rows) => {
          if (err) {
            console.log('최근 메시지 조회 오류:', err.message);
          } else {
            // 위치 기반 필터링 (500m 이내) + 시간순 정렬
            const nearbyMessages = rows.filter(row => {
              const distance = calculateDistance(latitude, longitude, row.latitude, row.longitude);
              return distance <= 500;
            });
            
            if (nearbyMessages.length > 0) {
              // senderName이 없는 메시지들은 필터링하고, 시간순으로 정렬 (오래된 메시지부터)
              const validMessages = nearbyMessages.filter(m => m.senderName && m.senderName.trim() !== '');
              const sortedMessages = validMessages.sort((a, b) => 
                new Date(a.timestamp) - new Date(b.timestamp)
              );
              
              console.log(`📨 ${username}에게 최근 메시지 ${sortedMessages.length}개 전송`);
              console.log('📨 전송할 메시지들:', sortedMessages.map(m => ({ sender: m.senderName, message: m.message, timestamp: m.timestamp })));
              socket.emit('recentMessages', sortedMessages);
            } else {
              console.log(`📨 ${username}에게 전송할 최근 메시지가 없습니다.`);
            }
          }
        }
      );
    } else {
      console.log(`📨 데이터베이스 없음: ${username}에게 최근 메시지 전송 건너뜀`);
    }
    
    console.log(`✅ ${username}님 등록 완료\n`);
    
    // 모든 기존 사용자에게 근처 사용자 리스트 업데이트
    updateAllUsersNearbyList();
  });

  // 위치 업데이트
  socket.on('updateLocation', (data) => {
    const { latitude, longitude } = data;
    const user = connectedUsers.get(socket.id);
    
    if (user) {
      user.latitude = latitude;
      user.longitude = longitude;
      user.lastSeen = new Date();
      
      // 데이터베이스 업데이트
      if (db) {
        db.run(
          'UPDATE users SET latitude = ?, longitude = ?, last_seen = ? WHERE socket_id = ?',
          [latitude, longitude, new Date().toISOString(), socket.id]
        );
      }

      // 근처 사용자들에게 위치 업데이트 알림
      const nearbyUsers = findNearbyUsers(latitude, longitude, socket.id);
      nearbyUsers.forEach(nearbyUser => {
        io.to(nearbyUser.socketId).emit('userLocationUpdated', {
          socketId: socket.id,
          username: user.username,
          latitude,
          longitude,
          distance: nearbyUser.distance
        });
      });
      
      // 모든 사용자에게 근처 사용자 리스트 업데이트
      updateAllUsersNearbyList();
    }
  });

  // 메시지 전송
  socket.on('sendMessage', (data) => {
    const { message } = data;
    const user = connectedUsers.get(socket.id);
    
    // Rate Limiting 검사
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: '메시지 전송 속도가 너무 빠릅니다. 잠시 후 다시 시도해주세요.' });
      return;
    }
    
    // 입력값 검증
    if (!validateInput(message)) {
      socket.emit('error', { message: '유효하지 않은 메시지입니다.' });
      return;
    }
    
    if (user && user.latitude && user.longitude) {
      console.log(`\n💬 메시지 전송: ${user.username}`);
      console.log(`📝 내용: ${message}`);
      console.log(`📍 위치: ${user.latitude}, ${user.longitude}`);
      
      const nearbyUsers = findNearbyUsers(user.latitude, user.longitude, socket.id);
      
      // 근처 사용자들에게 메시지 전송
      const messageData = {
        senderId: socket.id,
        senderName: user.username,
        message,
        latitude: user.latitude,
        longitude: user.longitude,
        timestamp: new Date().toISOString()
      };

      if (nearbyUsers.length > 0) {
        console.log(`📤 ${nearbyUsers.length}명에게 메시지 전송`);
        nearbyUsers.forEach(nearbyUser => {
          console.log(`  → ${nearbyUser.username}에게 전송 (${nearbyUser.distance}m)`);
          io.to(nearbyUser.socketId).emit('newMessage', messageData);
        });
      } else {
        console.log(`⚠️ 근처에 메시지를 받을 사용자가 없습니다.`);
      }

      // 발신자에게도 메시지 전송 (확인용)
      socket.emit('messageSent', messageData);

      // 데이터베이스에 메시지 저장
      if (db) {
        db.run(
          'INSERT INTO messages (sender_id, sender_name, message, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [socket.id, user.username, message, user.latitude, user.longitude, new Date().toISOString()]
        );
      }

      console.log(`✅ 메시지 전송 완료\n`);
    } else {
      console.log(`❌ 메시지 전송 실패: 사용자 정보 또는 위치 정보 없음`);
    }
  });

  // 근처 사용자 목록 요청
  socket.on('getNearbyUsers', () => {
    const user = connectedUsers.get(socket.id);
    if (user && user.latitude && user.longitude) {
      const nearbyUsers = findNearbyUsers(user.latitude, user.longitude, socket.id);
      socket.emit('nearbyUsers', nearbyUsers);
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      // 근처 사용자들에게 사용자 퇴장 알림
      const nearbyUsers = findNearbyUsers(user.latitude, user.longitude, socket.id);
      nearbyUsers.forEach(nearbyUser => {
        io.to(nearbyUser.socketId).emit('userLeft', {
          socketId: socket.id,
          username: user.username
        });
      });

      // 프라이빗 방에서 사용자 제거
      const userRoomCode = userRooms.get(socket.id);
      if (userRoomCode) {
        leavePrivateRoom(socket.id, userRoomCode);
      }

      connectedUsers.delete(socket.id);
      userRooms.delete(socket.id);
      console.log(`${user.username}님이 연결을 해제했습니다.`);
      
      // 모든 사용자에게 근처 사용자 리스트 업데이트
      updateAllUsersNearbyList();
    }
  });

  // 프라이빗 방 생성
  console.log('🔧 createPrivateRoom 이벤트 리스너 등록됨');
  socket.on('createPrivateRoom', (data) => {
    console.log('🔧 createPrivateRoom 이벤트 수신:', data);
    const { roomCode, username, latitude, longitude } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    // 입력값 검증
    if (!validateInput(roomCode, 6) || roomCode.length !== 6) {
      socket.emit('privateRoomError', { message: '유효하지 않은 방 코드입니다.' });
      return;
    }

    // 방 코드 형식 검증 (영문 대문자 + 숫자만)
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      socket.emit('privateRoomError', { message: '방 코드는 6자리 영문 대문자와 숫자만 가능합니다.' });
      return;
    }

    // 이미 다른 프라이빗 방에 있는지 확인
    if (userRooms.has(socket.id)) {
      socket.emit('privateRoomError', { message: '이미 다른 프라이빗 방에 참가 중입니다.' });
      return;
    }

    // 방이 이미 존재하는지 확인
    if (privateRooms.has(roomCode)) {
      socket.emit('privateRoomError', { message: '이미 존재하는 방 코드입니다.' });
      return;
    }

    console.log(`🏠 프라이빗 방 생성: ${username} -> ${roomCode}`);

    // 새 방 생성
    privateRooms.set(roomCode, {
      users: new Set(),
      messages: [],
      createdAt: new Date(),
      creator: socket.id
    });

    const room = privateRooms.get(roomCode);
    
    // 생성자를 방에 추가
    room.users.add(socket.id);
    userRooms.set(socket.id, roomCode);
    
    // 소켓을 방에 조인
    socket.join(roomCode);
    
    // 생성자에게 방 생성 성공 알림
    socket.emit('privateRoomJoined', {
      roomCode: roomCode,
      users: Array.from(room.users).map(socketId => {
        const roomUser = connectedUsers.get(socketId);
        return roomUser ? { socketId, username: roomUser.username } : null;
      }).filter(Boolean)
    });

    console.log(`✅ ${username}님이 프라이빗 방 ${roomCode}를 생성하고 입장했습니다.`);
  });

  // 프라이빗 방 참가
  socket.on('joinPrivateRoom', (data) => {
    const { roomCode, username, latitude, longitude } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    // 입력값 검증
    if (!validateInput(roomCode, 6) || roomCode.length !== 6) {
      socket.emit('privateRoomError', { message: '유효하지 않은 방 코드입니다.' });
      return;
    }

    // 방 코드 형식 검증 (영문 대문자 + 숫자만)
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      socket.emit('privateRoomError', { message: '방 코드는 6자리 영문 대문자와 숫자만 가능합니다.' });
      return;
    }

    // 이미 다른 프라이빗 방에 있는지 확인
    if (userRooms.has(socket.id)) {
      socket.emit('privateRoomError', { message: '이미 다른 프라이빗 방에 참가 중입니다.' });
      return;
    }

    console.log(`🔐 프라이빗 방 참가 요청: ${username} -> ${roomCode}`);

    // 방이 존재하지 않으면 에러 (기존 방만 참가 가능)
    if (!privateRooms.has(roomCode)) {
      socket.emit('privateRoomError', { message: '존재하지 않는 프라이빗 방입니다. 방 코드를 확인해주세요.' });
      return;
    }

    const room = privateRooms.get(roomCode);
    
    // 사용자를 방에 추가
    room.users.add(socket.id);
    userRooms.set(socket.id, roomCode);
    
    // 소켓을 방에 조인
    socket.join(roomCode);
    
    // 방의 다른 사용자들에게 새 사용자 참가 알림
    socket.to(roomCode).emit('userJoinedPrivateRoom', {
      socketId: socket.id,
      username: user.username,
      roomCode: roomCode
    });

    // 사용자에게 방 참가 성공 알림
    socket.emit('privateRoomJoined', {
      roomCode: roomCode,
      users: Array.from(room.users).map(socketId => {
        const roomUser = connectedUsers.get(socketId);
        return roomUser ? { socketId, username: roomUser.username } : null;
      }).filter(Boolean)
    });

    console.log(`✅ ${username}님이 프라이빗 방 ${roomCode}에 참가했습니다.`);
  });

  // 프라이빗 방 메시지 전송
  socket.on('sendPrivateMessage', (data) => {
    const { message, roomCode } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    // Rate Limiting 검사
    if (!checkRateLimit(socket.id)) {
      socket.emit('privateRoomError', { message: '메시지 전송 속도가 너무 빠릅니다.' });
      return;
    }

    // 입력값 검증
    if (!validateInput(message)) {
      socket.emit('privateRoomError', { message: '유효하지 않은 메시지입니다.' });
      return;
    }

    if (!validateInput(roomCode, 6) || roomCode.length !== 6) {
      socket.emit('privateRoomError', { message: '유효하지 않은 방 코드입니다.' });
      return;
    }

    const userRoomCode = userRooms.get(socket.id);
    if (userRoomCode !== roomCode) {
      socket.emit('privateRoomError', { message: '해당 방에 참가하지 않았습니다.' });
      return;
    }

    // 방이 존재하는지 확인
    if (!privateRooms.has(roomCode)) {
      socket.emit('privateRoomError', { message: '존재하지 않는 방입니다.' });
      return;
    }

    console.log(`💬 프라이빗 메시지: ${user.username} -> ${roomCode}`);
    console.log(`📝 내용: ${message}`);

    const messageData = {
      senderId: socket.id,
      senderName: user.username,
      message,
      roomCode,
      timestamp: new Date().toISOString()
    };

    // 방의 모든 사용자에게 메시지 전송
    io.to(roomCode).emit('newPrivateMessage', messageData);
    
    // 전송자에게 전송 확인 메시지 보내기
    socket.emit('privateMessageSent', messageData);

    // 방의 메시지 히스토리에 저장
    const room = privateRooms.get(roomCode);
    if (room) {
      room.messages.push(messageData);
      // 최근 100개 메시지만 유지
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
    }

    console.log(`✅ 프라이빗 메시지 전송 완료`);
  });

  // 프라이빗 방 초대
  socket.on('inviteToPrivateRoom', (data) => {
    const { roomCode, targetUsername } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    // 방이 존재하는지 확인
    const room = privateRooms.get(roomCode);
    if (!room) {
      socket.emit('privateRoomError', { message: '존재하지 않는 방입니다.' });
      return;
    }

    // 초대자가 해당 방에 있는지 확인
    if (!room.users.has(socket.id)) {
      socket.emit('privateRoomError', { message: '해당 방에 참가하지 않았습니다.' });
      return;
    }

    // 초대할 사용자 찾기
    let targetSocketId = null;
    for (const [socketId, connectedUser] of connectedUsers.entries()) {
      if (connectedUser.username === targetUsername) {
        targetSocketId = socketId;
        break;
      }
    }

    if (!targetSocketId) {
      socket.emit('privateRoomError', { message: '초대할 사용자를 찾을 수 없습니다.' });
      return;
    }

    // 초대 메시지 전송
    io.sockets.sockets.get(targetSocketId)?.emit('privateRoomInvite', {
      roomCode: roomCode,
      inviterUsername: user.username,
      inviterSocketId: socket.id
    });

    console.log(`📨 ${user.username}님이 ${targetUsername}님을 프라이빗 방 ${roomCode}에 초대했습니다.`);
  });

  // 프라이빗 방 초대 응답
  socket.on('respondToPrivateRoomInvite', (data) => {
    const { roomCode, inviterSocketId, accept } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    if (accept) {
      // 초대 수락 - 방에 참가
      socket.emit('joinPrivateRoom', { roomCode: roomCode });
    } else {
      // 초대 거절
      io.sockets.sockets.get(inviterSocketId)?.emit('privateRoomInviteRejected', {
        targetUsername: user.username
      });
    }

    console.log(`${user.username}님이 프라이빗 방 초대를 ${accept ? '수락' : '거절'}했습니다.`);
  });

  // 프라이빗 방 삭제 투표 시작
  socket.on('startRoomDeletionVote', (data) => {
    const { roomCode } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    const room = privateRooms.get(roomCode);
    if (!room) {
      socket.emit('privateRoomError', { message: '존재하지 않는 방입니다.' });
      return;
    }

    // 방에 있는 사용자만 투표 시작 가능
    if (!room.users.has(socket.id)) {
      socket.emit('privateRoomError', { message: '방에 참가하지 않은 사용자는 투표를 시작할 수 없습니다.' });
      return;
    }

    // 이미 투표가 진행 중인지 확인
    if (roomDeletionVotes.has(roomCode)) {
      socket.emit('privateRoomError', { message: '이미 삭제 투표가 진행 중입니다.' });
      return;
    }

    const totalUsers = room.users.size;
    const requiredVotes = Math.ceil(totalUsers / 2); // 절반 이상

    // 투표 시작
    roomDeletionVotes.set(roomCode, {
      votes: new Set(),
      requiredVotes: requiredVotes,
      initiator: socket.id
    });

    // 방의 모든 사용자에게 투표 시작 알림
    io.to(roomCode).emit('roomDeletionVoteStarted', {
      roomCode: roomCode,
      initiator: user.username,
      totalUsers: totalUsers,
      requiredVotes: requiredVotes
    });

    console.log(`🗳️ 프라이빗 방 삭제 투표 시작: ${roomCode} (필요 투표: ${requiredVotes}/${totalUsers})`);
  });

  // 프라이빗 방 삭제 투표
  socket.on('voteRoomDeletion', (data) => {
    const { roomCode, vote } = data;
    const user = connectedUsers.get(socket.id);
    
    if (!user) {
      socket.emit('privateRoomError', { message: '사용자 정보를 찾을 수 없습니다.' });
      return;
    }

    const voteData = roomDeletionVotes.get(roomCode);
    if (!voteData) {
      socket.emit('privateRoomError', { message: '진행 중인 삭제 투표가 없습니다.' });
      return;
    }

    const room = privateRooms.get(roomCode);
    if (!room || !room.users.has(socket.id)) {
      socket.emit('privateRoomError', { message: '방에 참가하지 않은 사용자는 투표할 수 없습니다.' });
      return;
    }

    if (vote === 'agree') {
      voteData.votes.add(socket.id);
      
      // 투표 결과 확인
      if (voteData.votes.size >= voteData.requiredVotes) {
        // 투표 성공 - 방 삭제
        console.log(`🗳️ 프라이빗 방 삭제 투표 성공: ${roomCode}`);
        
        // 방의 모든 사용자에게 삭제 알림
        io.to(roomCode).emit('roomDeletionVotePassed', {
          roomCode: roomCode,
          totalVotes: voteData.votes.size,
          requiredVotes: voteData.requiredVotes
        });

        // 모든 사용자를 방에서 내보내기
        room.users.forEach(socketId => {
          leavePrivateRoom(socketId, roomCode);
        });

        // 방과 투표 데이터 삭제
        privateRooms.delete(roomCode);
        roomDeletionVotes.delete(roomCode);
      } else {
        // 투표 진행 중
        io.to(roomCode).emit('roomDeletionVoteUpdated', {
          roomCode: roomCode,
          currentVotes: voteData.votes.size,
          requiredVotes: voteData.requiredVotes
        });
      }
    } else if (vote === 'disagree') {
      // 반대 투표 - 투표 취소
      roomDeletionVotes.delete(roomCode);
      io.to(roomCode).emit('roomDeletionVoteCancelled', {
        roomCode: roomCode,
        reason: '반대 투표로 인해 취소되었습니다.'
      });
    }
  });

  // 프라이빗 방 나가기
  socket.on('leavePrivateRoom', (data) => {
    const { roomCode } = data;
    leavePrivateRoom(socket.id, roomCode);
  });


});

// API 라우트
app.get('/api/users', (req, res) => {
  const users = Array.from(connectedUsers.entries()).map(([socketId, user]) => ({
    socketId,
    username: user.username,
    latitude: user.latitude,
    longitude: user.longitude,
    lastSeen: user.lastSeen
  }));
  res.json(users);
});

app.get('/api/messages', (req, res) => {
  const { lat, lon, radius = 500 } = req.query;
  
  if (lat && lon && db) {
    db.all(
      'SELECT * FROM messages WHERE timestamp > datetime("now", "-1 hour") ORDER BY timestamp DESC LIMIT 50',
      (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        // 위치 기반 필터링
        const filteredMessages = rows.filter(row => {
          const distance = calculateDistance(parseFloat(lat), parseFloat(lon), row.latitude, row.longitude);
          return distance <= radius;
        });
        
        res.json(filteredMessages);
      }
    );
  } else {
    res.status(400).json({ error: '위도와 경도가 필요합니다.' });
  }
});

// 프라이빗 방 관련 헬퍼 함수들
function leavePrivateRoom(socketId, roomCode) {
  const user = connectedUsers.get(socketId);
  if (!user) return;

  const room = privateRooms.get(roomCode);
  if (!room) return;

  // 사용자를 방에서 제거
  room.users.delete(socketId);
  userRooms.delete(socketId);

  // 소켓을 방에서 나가기
  io.sockets.sockets.get(socketId)?.leave(roomCode);

  // 방의 다른 사용자들에게 사용자 퇴장 알림
  io.to(roomCode).emit('userLeftPrivateRoom', {
    socketId: socketId,
    username: user.username,
    roomCode: roomCode
  });

  // 방이 비어있어도 방은 유지 (다시 입장할 수 있도록)
  if (room.users.size === 0) {
    console.log(`🏠 프라이빗 방 ${roomCode}가 비어있습니다. (방은 유지됨)`);
  }

  console.log(`${user.username}님이 프라이빗 방 ${roomCode}에서 나갔습니다.`);
}

// 프라이빗 방 정보 조회 API
app.get('/api/private-rooms', (req, res) => {
  const rooms = Array.from(privateRooms.entries()).map(([roomCode, room]) => ({
    roomCode,
    userCount: room.users.size,
    messageCount: room.messages.length
  }));
  res.json(rooms);
});

// 자동 정리 함수들
function cleanupOldRooms() {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000; // 1시간
  
  for (const [roomCode, room] of privateRooms.entries()) {
    // 1시간 이상 비어있는 방 삭제
    if (room.users.size === 0 && (now - room.createdAt) > ONE_HOUR) {
      privateRooms.delete(roomCode);
      console.log(`🧹 오래된 빈 방 삭제: ${roomCode}`);
    }
  }
}

function cleanupOldLimits() {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000; // 1시간
  
  for (const [socketId, limit] of messageLimits.entries()) {
    if ((now - limit.lastReset) > ONE_HOUR) {
      messageLimits.delete(socketId);
    }
  }
}

// 10분마다 정리 작업 실행
setInterval(() => {
  cleanupOldRooms();
  cleanupOldLimits();
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('서버 시작 준비 중...');
console.log(`PORT: ${PORT}`);
console.log(`HOST: ${HOST}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

server.listen(PORT, HOST, () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 성공적으로 실행 중입니다.`);
  console.log(`환경: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🚀 프로덕션 서버가 실행 중입니다.`);
  } else {
    console.log(`🌐 http://localhost:${PORT}에서 접속하세요.`);
  }
  console.log(`💚 헬스 체크: http://localhost:${PORT}/health`);
}).on('error', (error) => {
  console.error('❌ 서버 시작 오류:', error);
  console.error('오류 코드:', error.code);
  console.error('오류 메시지:', error.message);
  process.exit(1);
});
