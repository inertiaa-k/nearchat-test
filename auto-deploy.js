const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 감시할 파일 확장자
const WATCH_EXTENSIONS = ['.js', '.html', '.css', '.json', '.md', '.yaml', '.yml'];
// 무시할 디렉토리
const IGNORE_DIRS = ['node_modules', '.git', '.github'];

let isCommitting = false;

// Git 명령어 실행 함수
function runGitCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ${command}:`, error);
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

// 자동 커밋 및 푸시
async function autoCommitAndPush() {
  if (isCommitting) return;
  
  isCommitting = true;
  
  try {
    // Git 상태 확인
    const status = await runGitCommand('git status --porcelain');
    
    if (status.trim()) {
      console.log('변경사항이 감지되었습니다. 자동 커밋을 시작합니다...');
      
      // 모든 변경사항 추가
      await runGitCommand('git add .');
      
      // 커밋
      const timestamp = new Date().toLocaleString('ko-KR');
      await runGitCommand(`git commit -m "자동 업데이트: ${timestamp}"`);
      
      // 푸시
      await runGitCommand('git push origin main');
      
      console.log('✅ 자동 커밋 및 푸시가 완료되었습니다!');
    }
  } catch (error) {
    console.error('❌ 자동 커밋 중 오류가 발생했습니다:', error.message);
  } finally {
    isCommitting = false;
  }
}

// 파일 변경 감지
function watchFiles(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(file)) {
        watchFiles(filePath);
      }
    } else {
      const ext = path.extname(file);
      if (WATCH_EXTENSIONS.includes(ext)) {
        fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
          if (curr.mtime > prev.mtime) {
            console.log(`📝 파일 변경 감지: ${filePath}`);
            setTimeout(autoCommitAndPush, 2000); // 2초 후 커밋 (연속 변경 방지)
          }
        });
      }
    }
  });
}

// 메인 실행
console.log('🚀 자동 Git 업데이트 모니터링을 시작합니다...');
console.log('감시 중인 파일 확장자:', WATCH_EXTENSIONS.join(', '));
console.log('무시 중인 디렉토리:', IGNORE_DIRS.join(', '));
console.log('Ctrl+C로 종료할 수 있습니다.\n');

watchFiles('.');

// 수동 커밋 트리거 (Ctrl+C 대신 'c' 키 입력)
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', (key) => {
  if (key === 'c') {
    console.log('\n📤 수동 커밋을 시작합니다...');
    autoCommitAndPush();
  } else if (key === '\u0003') {
    console.log('\n👋 모니터링을 종료합니다.');
    process.exit();
  }
});
