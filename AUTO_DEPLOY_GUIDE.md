# 🚀 자동 GitHub 업데이트 가이드

이 프로젝트는 코드 변경 시 자동으로 GitHub에 업데이트되도록 설정되어 있습니다.

## 📋 설정 방법

### 1. GitHub Actions 설정 (권장)

1. **GitHub Secrets 설정**
   - GitHub 저장소 → Settings → Secrets and variables → Actions
   - 다음 시크릿을 추가:
     - `RENDER_TOKEN`: Render API 토큰
     - `RENDER_SERVICE_ID`: Render 서비스 ID

2. **자동 배포 활성화**
   - main 브랜치에 푸시하면 자동으로 배포됩니다
   - `.github/workflows/deploy.yml` 파일이 이를 처리합니다

### 2. 로컬 자동 커밋 설정

```bash
# 자동 파일 감시 모드 시작
npm run watch
```

이 명령어를 실행하면:
- 파일 변경을 실시간으로 감지
- 2초 후 자동으로 Git에 커밋 및 푸시
- 'c' 키를 눌러 수동 커밋 가능
- Ctrl+C로 종료

### 3. 수동 배포

```bash
# 즉시 커밋 및 푸시
npm run deploy
```

## 🔧 감시 설정

### 감시하는 파일 확장자
- `.js` (JavaScript)
- `.html` (HTML)
- `.css` (CSS)
- `.json` (JSON)
- `.md` (Markdown)
- `.yaml`, `.yml` (YAML)

### 무시하는 디렉토리
- `node_modules/`
- `.git/`
- `.github/`

## ⚠️ 주의사항

1. **Git 설정 확인**
   - Git이 올바르게 설정되어 있는지 확인
   - GitHub 저장소가 연결되어 있는지 확인

2. **브랜치 확인**
   - 현재 main 브랜치에서 작업 중인지 확인
   - 다른 브랜치에서 작업 시 `git checkout main` 실행

3. **충돌 방지**
   - 다른 사람과 협업 시 충돌이 발생할 수 있음
   - 중요한 변경사항은 수동으로 커밋하는 것을 권장

## 🛠️ 문제 해결

### 자동 커밋이 작동하지 않는 경우
1. Git 상태 확인: `git status`
2. 원격 저장소 확인: `git remote -v`
3. 브랜치 확인: `git branch`

### GitHub Actions 오류
1. GitHub Secrets 설정 확인
2. 워크플로우 로그 확인
3. 권한 설정 확인

## 📝 사용 예시

```bash
# 개발 서버 시작
npm run dev

# 다른 터미널에서 자동 감시 시작
npm run watch

# 파일 수정 후 자동으로 GitHub에 업데이트됨
```

이제 코드를 수정하면 자동으로 GitHub에 업데이트됩니다! 🎉
