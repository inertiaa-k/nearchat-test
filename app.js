// 전역 변수
let socket;
let currentUser = {
    username: '',
    latitude: null,
    longitude: null
};
let nearbyUsers = [];
let locationWatchId = null;
let currentRoomCode = null;
let isInPrivateRoom = false;
let hasPrivateRoomAccess = false; // 프라이빗 방 접근 권한이 있는지 확인

// DOM 요소들
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('username');
const startChatBtn = document.getElementById('startChatBtn');
const locationStatus = document.getElementById('locationStatus');
const currentUsername = document.getElementById('currentUsername');
const locationText = document.getElementById('locationText');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');
const nearbyUsersBtn = document.getElementById('nearbyUsersBtn');
const nearbyCount = document.getElementById('nearbyCount');
const refreshLocationBtn = document.getElementById('refreshLocationBtn');
const nearbyUsersModal = document.getElementById('nearbyUsersModal');
const nearbyUsersList = document.getElementById('nearbyUsersList');
const closeModalBtn = document.getElementById('closeModalBtn');
const toast = document.getElementById('toast');

// 프라이빗 방 관련 DOM 요소들
const createPrivateRoomBtn = document.getElementById('createPrivateRoomBtn');
const joinPrivateRoomBtn = document.getElementById('joinPrivateRoomBtn');
const createPrivateRoomModal = document.getElementById('createPrivateRoomModal');
const joinPrivateRoomModal = document.getElementById('joinPrivateRoomModal');
const generatedRoomCode = document.getElementById('generatedRoomCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const enterPrivateRoomBtn = document.getElementById('enterPrivateRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
const closeJoinModalBtn = document.getElementById('closeJoinModalBtn');

// 상단 네비게이션 바 관련 DOM 요소들
const topNavigationBar = document.getElementById('topNavigationBar');
const navRoomCode = document.getElementById('navRoomCode');
const quickEnterPrivateBtn = document.getElementById('quickEnterPrivateBtn');
const closePrivateRoomBtn = document.getElementById('closePrivateRoomBtn');

// 프라이빗 방 삭제 투표 관련 DOM 요소들
const roomDeletionVoteModal = document.getElementById('roomDeletionVoteModal');
const voteContent = document.getElementById('voteContent');
const agreeVoteBtn = document.getElementById('agreeVoteBtn');
const disagreeVoteBtn = document.getElementById('disagreeVoteBtn');
const closeVoteModalBtn = document.getElementById('closeVoteModalBtn');



// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    getCurrentLocation();
});



// 앱 초기화
function initializeApp() {
    // Socket.IO 연결
    socket = io();
    console.log('🔧 Socket.IO 연결 시도...');
    
    // Socket 이벤트 리스너 설정
    setupSocketListeners();
    
    // 사용자 이름 입력 필드 이벤트
    usernameInput.addEventListener('input', validateForm);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && startChatBtn.disabled === false) {
            startChat();
        }
    });
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 채팅 시작 버튼
    startChatBtn.addEventListener('click', startChat);
    
    // 뒤로가기 버튼
    backBtn.addEventListener('click', () => {
        if (isInPrivateRoom) {
            // 프라이빗 방에서 나가기 (접근 권한 유지)
            leavePrivateRoom();
        } else if (hasPrivateRoomAccess && currentRoomCode) {
            // 프라이빗 방에 접근 권한이 있지만 입장하지 않은 상태에서 뒤로가기
            // 로그인 화면으로 돌아가기
            showScreen(loginScreen);
            disconnectFromChat();
        } else {
            // 로그인 화면으로 돌아가기
            showScreen(loginScreen);
            disconnectFromChat();
        }
    });
    
    // 메시지 전송
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 근처 사용자 버튼
    nearbyUsersBtn.addEventListener('click', showNearbyUsersModal);
    
    // 위치 새로고침
    refreshLocationBtn.addEventListener('click', refreshLocation);
    
    // 모달 닫기
    closeModalBtn.addEventListener('click', hideNearbyUsersModal);
    nearbyUsersModal.addEventListener('click', (e) => {
        if (e.target === nearbyUsersModal) {
            hideNearbyUsersModal();
        }
    });
    
    // 프라이빗 방 관련 이벤트 리스너
    createPrivateRoomBtn.addEventListener('click', showCreatePrivateRoomModal);
    joinPrivateRoomBtn.addEventListener('click', showJoinPrivateRoomModal);
    copyCodeBtn.addEventListener('click', copyRoomCode);
    enterPrivateRoomBtn.addEventListener('click', enterPrivateRoom);
    joinRoomBtn.addEventListener('click', joinPrivateRoom);
    closeCreateModalBtn.addEventListener('click', hideCreatePrivateRoomModal);
    closeJoinModalBtn.addEventListener('click', hideJoinPrivateRoomModal);
    
    // 모달 외부 클릭 시 닫기
    createPrivateRoomModal.addEventListener('click', (e) => {
        if (e.target === createPrivateRoomModal) {
            hideCreatePrivateRoomModal();
        }
    });
    
    joinPrivateRoomModal.addEventListener('click', (e) => {
        if (e.target === joinPrivateRoomModal) {
            hideJoinPrivateRoomModal();
        }
    });
    
    // 방 코드 입력 필드 이벤트
    roomCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
    
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinPrivateRoom();
        }
    });
    
    // 상단 네비게이션 바 관련 이벤트 리스너
    quickEnterPrivateBtn.addEventListener('click', quickEnterPrivateRoom);
    closePrivateRoomBtn.addEventListener('click', startRoomDeletionVote);
    
    // 프라이빗 방 삭제 투표 관련 이벤트 리스너
    agreeVoteBtn.addEventListener('click', () => voteRoomDeletion('agree'));
    disagreeVoteBtn.addEventListener('click', () => voteRoomDeletion('disagree'));
    closeVoteModalBtn.addEventListener('click', hideRoomDeletionVoteModal);
    
    // 투표 모달 외부 클릭 시 닫기
    roomDeletionVoteModal.addEventListener('click', (e) => {
        if (e.target === roomDeletionVoteModal) {
            hideRoomDeletionVoteModal();
        }
    });
}

// Socket.IO 이벤트 리스너 설정
function setupSocketListeners() {
    // 연결 성공
    socket.on('connect', () => {
        console.log('🔧 서버에 연결되었습니다. Socket ID:', socket.id);
        showToast('서버에 연결되었습니다.', 'success');
    });
    
    // 연결 해제
    socket.on('disconnect', () => {
        console.log('서버와의 연결이 끊어졌습니다.');
        showToast('서버와의 연결이 끊어졌습니다.', 'error');
    });
    
    // 근처 사용자 목록 수신
    socket.on('nearbyUsers', (users) => {
        nearbyUsers = users;
        updateNearbyCount();
        console.log('근처 사용자:', users);
    });
    
    // 새 사용자 참가
    socket.on('userJoined', (user) => {
        addUserJoinedMessage(user.username);
        showToast(`${user.username}님이 참가했습니다.`, 'info');
    });
    
    // 사용자 퇴장
    socket.on('userLeft', (user) => {
        addUserLeftMessage(user.username);
        showToast(`${user.username}님이 나갔습니다.`, 'info');
    });
    
    // 새 메시지 수신
    socket.on('newMessage', (messageData) => {
        // 전송자의 메시지는 messageSent 이벤트에서 처리하므로 여기서는 제외
        if (messageData.senderName !== currentUser.username) {
            addMessage(messageData, false);
        }
    });
    
    // 메시지 전송 확인
    socket.on('messageSent', (messageData) => {
        // 전송한 메시지는 항상 오른쪽에 표시
        addMessage(messageData, true);
    });

    // 최근 메시지 히스토리 수신
    socket.on('recentMessages', (messages) => {
        console.log('🔧 최근 메시지 히스토리 수신:', messages.length + '개');
        console.log('🔧 메시지 데이터:', messages);
        
        // 기존 메시지 컨테이너 초기화
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            // 메시지가 없으면 환영 메시지 표시
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-hand-wave"></i>
                    <h3>환영합니다!</h3>
                    <p>근처 500m 내의 사람들과 대화를 시작하세요.</p>
                    <p>메시지를 입력하고 Enter를 누르거나 전송 버튼을 클릭하세요.</p>
                </div>
            `;
            console.log('🔧 환영 메시지 표시됨');
        } else {
            console.log('🔧 최근 메시지들을 표시 중...');
            // 최근 메시지들을 시간순으로 표시 (별도 헤더 없이)
            messages.forEach((messageData, index) => {
                console.log(`🔧 메시지 ${index + 1}:`, messageData);
                addMessage(messageData, messageData.senderName === currentUser.username);
            });
            
            // 스크롤을 맨 아래로
            setTimeout(() => {
                scrollToBottom();
                console.log('🔧 스크롤을 맨 아래로 이동');
            }, 100);
        }
    });
    
    // 사용자 위치 업데이트
    socket.on('userLocationUpdated', (user) => {
        console.log(`${user.username}의 위치가 업데이트되었습니다.`);
    });

    // 프라이빗 방 관련 이벤트 리스너
    socket.on('privateRoomJoined', (data) => {
        isInPrivateRoom = true;
        currentRoomCode = data.roomCode;
        hasPrivateRoomAccess = true; // 프라이빗 방 접근 권한 설정
        updatePrivateRoomStatus();
        showTopNavigationBar(); // 상단 네비게이션 바 표시
        
        // 기존 메시지 컨테이너 초기화
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-lock"></i>
                <h3>프라이빗 방에 입장했습니다!</h3>
                <p>방 코드: <strong>${data.roomCode}</strong></p>
                <p>참가자: ${data.users.length}명</p>
                <p>이제 프라이빗하게 대화할 수 있습니다.</p>
            </div>
        `;
        
        showToast(`프라이빗 방 ${data.roomCode}에 입장했습니다.`, 'success');
    });

    socket.on('userJoinedPrivateRoom', (user) => {
        addUserJoinedMessage(user.username);
        showToast(`${user.username}님이 프라이빗 방에 참가했습니다.`, 'info');
    });

    socket.on('userLeftPrivateRoom', (user) => {
        addUserLeftMessage(user.username);
        showToast(`${user.username}님이 프라이빗 방에서 나갔습니다.`, 'info');
    });

    socket.on('newPrivateMessage', (messageData) => {
        // 프라이빗 방에서도 메시지 발신자에 따라 올바른 위치에 표시
        // 전송자의 메시지는 privateMessageSent 이벤트에서 처리하므로 여기서는 제외
        if (messageData.senderName !== currentUser.username) {
            addMessage(messageData, false);
        }
    });

    // 프라이빗 메시지 전송 확인
    socket.on('privateMessageSent', (messageData) => {
        // 전송한 프라이빗 메시지는 항상 오른쪽에 표시
        addMessage(messageData, true);
    });

    socket.on('privateRoomError', (error) => {
        showToast(error.message, 'error');
    });

    // 프라이빗 방 삭제 투표 관련 이벤트
    socket.on('roomDeletionVoteStarted', (data) => {
        showRoomDeletionVoteModal(data);
        showToast(`${data.initiator}님이 방 삭제 투표를 시작했습니다.`, 'info');
    });

    socket.on('roomDeletionVoteUpdated', (data) => {
        updateRoomDeletionVote(data);
        showToast(`방 삭제 투표 진행 중: ${data.currentVotes}/${data.requiredVotes}`, 'info');
    });

    socket.on('roomDeletionVotePassed', (data) => {
        hideRoomDeletionVoteModal();
        showToast(`방 삭제 투표가 통과되었습니다. (${data.totalVotes}/${data.requiredVotes})`, 'success');
        
        // 모든 사용자가 방에서 나가도록 처리
        if (isInPrivateRoom) {
            isInPrivateRoom = false;
            hasPrivateRoomAccess = false;
            currentRoomCode = null;
            updatePrivateRoomStatus();
            hideTopNavigationBar();
            
            // 일반 채팅 화면으로 복원
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-hand-wave"></i>
                    <h3>환영합니다!</h3>
                    <p>근처 500m 내의 사람들과 대화를 시작하세요.</p>
                    <p>메시지를 입력하고 Enter를 누르거나 전송 버튼을 클릭하세요.</p>
                </div>
            `;
        }
    });

    socket.on('roomDeletionVoteCancelled', (data) => {
        hideRoomDeletionVoteModal();
        showToast(`방 삭제 투표가 취소되었습니다: ${data.reason}`, 'info');
    });


}

// 현재 위치 가져오기
function getCurrentLocation() {
    if (!navigator.geolocation) {
        updateLocationStatus('이 브라우저는 위치 정보를 지원하지 않습니다.', 'error');
        return;
    }
    
    updateLocationStatus('위치 정보를 가져오는 중...', 'loading');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            currentUser.latitude = latitude;
            currentUser.longitude = longitude;
            
            updateLocationStatus('위치 정보를 성공적으로 가져왔습니다.', 'success');
            updateLocationText(latitude, longitude);
            validateForm();
            
            // 위치 추적 시작
            startLocationTracking();
        },
        (error) => {
            let errorMessage = '위치 정보를 가져올 수 없습니다.';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '위치 정보 접근이 거부되었습니다.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '위치 정보 요청 시간이 초과되었습니다.';
                    break;
            }
            updateLocationStatus(errorMessage, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5분
        }
    );
}

// 위치 추적 시작
function startLocationTracking() {
    if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
    }
    
    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            currentUser.latitude = latitude;
            currentUser.longitude = longitude;
            
            updateLocationText(latitude, longitude);
            
            // 채팅 중이면 서버에 위치 업데이트 전송
            if (socket && socket.connected) {
                socket.emit('updateLocation', { latitude, longitude });
            }
        },
        (error) => {
            console.error('위치 추적 오류:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000 // 30초
        }
    );
}

// 위치 새로고침
function refreshLocation() {
    getCurrentLocation();
    showToast('위치 정보를 새로고침했습니다.', 'info');
}

// 위치 상태 업데이트
function updateLocationStatus(message, type) {
    locationStatus.textContent = message;
    locationStatus.className = type;
}

// 위치 텍스트 업데이트
function updateLocationText(latitude, longitude) {
    locationText.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

// 폼 유효성 검사
function validateForm() {
    const username = usernameInput.value.trim();
    const hasLocation = currentUser.latitude !== null && currentUser.longitude !== null;
    
    startChatBtn.disabled = !username || !hasLocation;
}

// 채팅 시작
function startChat() {
    const username = usernameInput.value.trim();
    if (!username || !currentUser.latitude || !currentUser.longitude) {
        showToast('닉네임과 위치 정보가 필요합니다.', 'error');
        return;
    }
    
    currentUser.username = username;
    

    
    // 서버에 사용자 등록
    socket.emit('register', {
        username: currentUser.username,
        latitude: currentUser.latitude,
        longitude: currentUser.longitude
    });
    
    // 채팅 화면으로 전환
    showScreen(chatScreen);
    currentUsername.textContent = currentUser.username;
    
    // 메시지 입력 필드에 포커스
    messageInput.focus();
    
    showToast('채팅에 참가했습니다!', 'success');
}

// 채팅 연결 해제
function disconnectFromChat() {
    if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
    

    
    // 입력 필드 초기화
    usernameInput.value = '';
    messageInput.value = '';
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <i class="fas fa-hand-wave"></i>
            <h3>환영합니다!</h3>
            <p>근처 30m 내의 사람들과 대화를 시작하세요.</p>
            <p>메시지를 입력하고 Enter를 누르거나 전송 버튼을 클릭하세요.</p>
        </div>
    `;
    
    nearbyUsers = [];
    updateNearbyCount();
    
    showToast('채팅에서 나갔습니다.', 'info');
}

// 메시지 전송
function sendMessage() {
    const message = messageInput.value.trim();
    
    // 입력값 검증
    if (!validateInput(message)) {
        showToast('유효하지 않은 메시지입니다.', 'error');
        return;
    }
    
    if (isInPrivateRoom && currentRoomCode) {
        // 프라이빗 방 메시지 전송
        socket.emit('sendPrivateMessage', { 
            message: escapeHtml(message), 
            roomCode: currentRoomCode 
        });
    } else {
        // 일반 채팅 메시지 전송
        socket.emit('sendMessage', { message: escapeHtml(message) });
    }
    
    messageInput.value = '';
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

// 입력값 검증 함수
function validateInput(input, maxLength = 500) {
    if (typeof input !== 'string') return false;
    if (input.length > maxLength) return false;
    if (input.trim().length === 0) return false;
    return true;
}

// 메시지 추가
function addMessage(messageData, isSent) {
    console.log('🔧 addMessage 호출됨:', { messageData, isSent });
    
    // 입력값 검증
    if (!validateInput(messageData.message) || !validateInput(messageData.senderName, 20)) {
        console.error('유효하지 않은 메시지 데이터:', messageData);
        return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    // 발신자 이름을 메시지 위에 표시 (받은 메시지만)
    if (!isSent) {
        const senderNameTop = document.createElement('div');
        senderNameTop.className = 'sender-name-top';
        senderNameTop.textContent = escapeHtml(messageData.senderName);
        messageDiv.appendChild(senderNameTop);
    }
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = escapeHtml(messageData.message);
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = formatTime(messageData.timestamp);
    
    messageInfo.appendChild(timestamp);
    
    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(messageInfo);
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// 사용자 참가 메시지 추가
function addUserJoinedMessage(username) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'user-joined';
    messageDiv.textContent = `${username}님이 참가했습니다.`;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// 사용자 퇴장 메시지 추가
function addUserLeftMessage(username) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'user-left';
    messageDiv.textContent = `${username}님이 나갔습니다.`;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// 근처 사용자 수 업데이트
function updateNearbyCount() {
    nearbyCount.textContent = nearbyUsers.length;
    console.log('🔧 근처 사용자 수 업데이트:', nearbyUsers.length);
    
    // 근처 사용자가 있으면 배지에 애니메이션 효과 추가
    if (nearbyUsers.length > 0) {
        nearbyCount.style.animation = 'pulse 1s ease-in-out';
        setTimeout(() => {
            nearbyCount.style.animation = '';
        }, 1000);
    }
}

// 근처 사용자 모달 표시
function showNearbyUsersModal() {
    nearbyUsersList.innerHTML = '';
    
    if (nearbyUsers.length === 0) {
        nearbyUsersList.innerHTML = '<p style="text-align: center; color: #666;">근처에 다른 사용자가 없습니다.</p>';
    } else {
        nearbyUsers.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            
            userItem.innerHTML = `
                <div class="user-info-modal">
                    <div class="user-name">${escapeHtml(user.username)}</div>
                    <div class="user-distance">${user.distance}m 거리</div>
                </div>
            `;
            
            nearbyUsersList.appendChild(userItem);
        });
    }
    
    nearbyUsersModal.classList.add('active');
}

// 근처 사용자 모달 숨기기
function hideNearbyUsersModal() {
    nearbyUsersModal.classList.remove('active');
}



// 화면 전환
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

// 스크롤을 맨 아래로
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 시간 포맷팅
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1분 이내
        return '방금 전';
    } else if (diff < 3600000) { // 1시간 이내
        return `${Math.floor(diff / 60000)}분 전`;
    } else {
        return date.toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// 토스트 메시지 표시
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
    }
});

// 온라인/오프라인 상태 감지
window.addEventListener('online', () => {
    showToast('인터넷 연결이 복구되었습니다.', 'success');
});

window.addEventListener('offline', () => {
    showToast('인터넷 연결이 끊어졌습니다.', 'error');
});

// ==================== 프라이빗 방 관련 함수들 ====================

// 랜덤 6자리 코드 생성
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 프라이빗 방 생성 모달 표시
function showCreatePrivateRoomModal() {
    const roomCode = generateRoomCode();
    generatedRoomCode.textContent = roomCode;
    currentRoomCode = roomCode;
    createPrivateRoomModal.classList.add('active');
    showTopNavigationBar(); // 상단 네비게이션 바 표시
}

// 프라이빗 방 생성 모달 숨기기
function hideCreatePrivateRoomModal() {
    createPrivateRoomModal.classList.remove('active');
    // currentRoomCode는 유지 (접근 권한 유지)
    // hideTopNavigationBar() 제거 (접근 권한이 있으면 계속 표시)
}

// 프라이빗 방 참가 모달 표시
function showJoinPrivateRoomModal() {
    roomCodeInput.value = '';
    joinPrivateRoomModal.classList.add('active');
    roomCodeInput.focus();
}

// 프라이빗 방 참가 모달 숨기기
function hideJoinPrivateRoomModal() {
    joinPrivateRoomModal.classList.remove('active');
}

// 방 코드 복사
function copyRoomCode() {
    if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode).then(() => {
            showToast('방 코드가 클립보드에 복사되었습니다.', 'success');
        }).catch(() => {
            showToast('클립보드 복사에 실패했습니다.', 'error');
        });
    }
}

// 프라이빗 방 입장
function enterPrivateRoom() {
    if (currentRoomCode) {
        console.log('🔧 createPrivateRoom 이벤트 전송:', {
            roomCode: currentRoomCode,
            username: currentUser.username,
            latitude: currentUser.latitude,
            longitude: currentUser.longitude
        });
        
        socket.emit('createPrivateRoom', {
            roomCode: currentRoomCode,
            username: currentUser.username,
            latitude: currentUser.latitude,
            longitude: currentUser.longitude
        });
        hideCreatePrivateRoomModal();
        hasPrivateRoomAccess = true; // 프라이빗 방 접근 권한 설정
        showTopNavigationBar(); // 상단 네비게이션 바 표시
        showToast('프라이빗 방을 생성하고 입장했습니다.', 'success');
    }
}

// 프라이빗 방 참가
function joinPrivateRoom() {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    
    if (roomCode.length !== 6) {
        showToast('6자리 방 코드를 입력해주세요.', 'error');
        return;
    }
    
    socket.emit('joinPrivateRoom', {
        roomCode: roomCode,
        username: currentUser.username,
        latitude: currentUser.latitude,
        longitude: currentUser.longitude
    });
    
    hideJoinPrivateRoomModal();
    hasPrivateRoomAccess = true; // 프라이빗 방 접근 권한 설정
    showToast('프라이빗 방 참가 요청을 보냈습니다.', 'info');
}

// 프라이빗 방 상태 업데이트
function updatePrivateRoomStatus() {
    if (isInPrivateRoom && currentRoomCode) {
        // 프라이빗 방 표시 추가
        const existingIndicator = document.querySelector('.private-room-indicator');
        if (!existingIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'private-room-indicator';
            indicator.innerHTML = `
                <i class="fas fa-lock"></i>
                <span>프라이빗 방: ${currentRoomCode}</span>
            `;
            document.querySelector('.user-info').appendChild(indicator);
        }
        
        // 상단 네비게이션 바 표시
        showTopNavigationBar();
    } else if (hasPrivateRoomAccess && currentRoomCode) {
        // 프라이빗 방에 접근 권한이 있지만 현재 입장하지 않은 상태
        showTopNavigationBar();
    } else {
        // 프라이빗 방 표시 제거
        const indicator = document.querySelector('.private-room-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        // 상단 네비게이션 바 숨기기
        hideTopNavigationBar();
    }
}

// 상단 네비게이션 바 표시
function showTopNavigationBar() {
    if (currentRoomCode) {
        navRoomCode.textContent = `프라이빗 방: ${currentRoomCode}`;
        
        // 현재 프라이빗 방에 입장해 있는지에 따라 버튼 텍스트 변경
        const quickEnterBtn = document.getElementById('quickEnterPrivateBtn');
        if (isInPrivateRoom) {
            quickEnterBtn.innerHTML = '<i class="fas fa-users"></i> 전체방으로';
            quickEnterBtn.disabled = false;
            quickEnterBtn.style.opacity = '1';
        } else {
            quickEnterBtn.innerHTML = '<i class="fas fa-lock"></i> 프라이빗방으로';
            quickEnterBtn.disabled = false;
            quickEnterBtn.style.opacity = '1';
        }
        
        topNavigationBar.style.display = 'block';
        chatScreen.classList.add('has-top-nav');
    }
}

// 상단 네비게이션 바 숨기기
function hideTopNavigationBar() {
    topNavigationBar.style.display = 'none';
    chatScreen.classList.remove('has-top-nav');
}

// 빠른 프라이빗 방 입장/일반 채팅방으로 돌아가기
function quickEnterPrivateRoom() {
    if (isInPrivateRoom) {
        // 프라이빗 방에서 일반 채팅방으로 돌아가기
        leavePrivateRoom();
    } else if (currentRoomCode && hasPrivateRoomAccess) {
        // 일반 채팅방에서 프라이빗 방으로 입장
        socket.emit('joinPrivateRoom', {
            roomCode: currentRoomCode,
            username: currentUser.username,
            latitude: currentUser.latitude,
            longitude: currentUser.longitude
        });
        showToast('프라이빗 방에 입장했습니다.', 'success');
    }
}

// 프라이빗 방 삭제 투표 시작
function startRoomDeletionVote() {
    if (isInPrivateRoom && currentRoomCode) {
        socket.emit('startRoomDeletionVote', { roomCode: currentRoomCode });
        showToast('프라이빗 방 삭제 투표를 시작했습니다.', 'info');
    } else {
        // 프라이빗 방에 입장하지 않은 상태에서는 바로 삭제
        closePrivateRoom();
    }
}

// 프라이빗 방 삭제 투표
function voteRoomDeletion(vote) {
    if (currentRoomCode) {
        socket.emit('voteRoomDeletion', { roomCode: currentRoomCode, vote: vote });
        hideRoomDeletionVoteModal();
        
        if (vote === 'agree') {
            showToast('방 삭제에 동의했습니다.', 'info');
        } else {
            showToast('방 삭제에 반대했습니다.', 'info');
        }
    }
}

// 투표 모달 표시
function showRoomDeletionVoteModal(data) {
    voteContent.innerHTML = `
        <h4>프라이빗 방 삭제 투표</h4>
        <p><strong>${data.initiator}</strong>님이 프라이빗 방 삭제를 제안했습니다.</p>
        <div class="vote-info">
            <p><strong>총 참가자:</strong> ${data.totalUsers}명</p>
            <p><strong>필요 동의:</strong> ${data.requiredVotes}명 이상</p>
        </div>
        <p>방 삭제에 동의하시겠습니까?</p>
    `;
    roomDeletionVoteModal.classList.add('active');
}

// 투표 모달 숨기기
function hideRoomDeletionVoteModal() {
    roomDeletionVoteModal.classList.remove('active');
}

// 투표 진행 상황 업데이트
function updateRoomDeletionVote(data) {
    voteContent.innerHTML = `
        <h4>프라이빗 방 삭제 투표 진행 중</h4>
        <div class="vote-info">
            <p><strong>현재 동의:</strong> ${data.currentVotes}명</p>
            <p><strong>필요 동의:</strong> ${data.requiredVotes}명</p>
        </div>
        <p>투표가 진행 중입니다...</p>
    `;
}

// 프라이빗 방 닫기 (개인 삭제)
function closePrivateRoom() {
    if (isInPrivateRoom) {
        leavePrivateRoom();
    }
    
    // 프라이빗 방 접근 권한 완전 삭제
    hasPrivateRoomAccess = false;
    currentRoomCode = null;
    hideTopNavigationBar();
    showToast('프라이빗 방이 삭제되었습니다.', 'info');
}



// 일반 채팅방으로 돌아가기
function leavePrivateRoom() {
    if (isInPrivateRoom) {
        socket.emit('leavePrivateRoom', { roomCode: currentRoomCode });
        isInPrivateRoom = false;
        // currentRoomCode와 hasPrivateRoomAccess는 유지 (접근 권한 유지)
        updatePrivateRoomStatus();
        
        // 일반 채팅 화면으로 복원
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-hand-wave"></i>
                <h3>환영합니다!</h3>
                <p>근처 500m 내의 사람들과 대화를 시작하세요.</p>
                <p>메시지를 입력하고 Enter를 누르거나 전송 버튼을 클릭하세요.</p>
            </div>
        `;
        
        showToast('일반 채팅방으로 돌아왔습니다. 상단 버튼으로 프라이빗 방에 다시 입장할 수 있습니다.', 'info');
    }
}
