# goodbye-ai-block

이미지와 텍스트를 난독화하여 검열을 피하고, 브라우저 확장으로 자동 복호화.

## 구조

```
web/                  ← 난독화/복호화 웹 도구
  index.html
  obfuscator.js       ← 핵심 엔진

extension/            ← 브라우저 확장 (Chrome, Firefox, Safari)
  manifest.json
  obfuscator.js
  background.js
  content.js
  popup.html
  options.html

test/
  index.html          ← 확장 테스트 페이지
```

## 웹 도구

1. `web/index.html`을 브라우저에서 열기
2. 이미지: 드래그/클릭/붙여넣기로 업로드 → **Convert** 클릭
3. 텍스트: 입력 후 **Convert** 클릭 → `AI1(...)` 형태로 출력
4. 난독화된 이미지/텍스트를 다시 넣으면 자동으로 원본 복구
5. Seed를 비워두면 기본값 사용

## 확장 설치

### Chrome / Edge / Brave

1. `chrome://extensions` 열기 → **개발자 모드** → **압축해제된 확장 로드** → `extension/` 선택

### Firefox

1. `about:debugging#/runtime/this-firefox` → **임시 부가 기능 로드** → `manifest.json` 선택 (121+)

### Safari (macOS / iOS)

1. `xcrun safari-web-extension-converter ./extension` → Xcode 빌드 → Safari 설정에서 활성화

### Android

- **Kiwi Browser**: 메뉴 → 확장 → `.zip` 로드
- **Firefox Android**: AMO 또는 부가 기능 컬렉션으로 `.xpi` 로드

### Seed 설정

확장 아이콘 클릭 또는 확장 설정(Options)에서 Seed 입력 후 저장.

## 알고리즘

### 이미지

1. Seed → SHA-256 → PRNG 시드
2. 8×8 블록 분할 → 색반전/채널회전/공간회전/플립 (PRNG 기반)
3. Fisher-Yates 셔플로 블록 재배치
4. 하단 8px에 매직 시그널 `AI!` 삽입 (JPEG 내성)

### 텍스트

1. Seed → SHA-256 → PRNG 시드
2. UTF-8 바이트별 XOR + 비트 회전
3. Base64 인코딩 후 `AI1(...)` 래핑
