# Anti-Zaiming (goodbye-k-censorship)

난독화한 이미지를 공유하여 검열을 피하고, 웹 브라우저 확장으로 자동으로 복호화하여 감상하세요.

## 구조

```
web/                  ← 이미지 난독화/복호화 웹 서비스
  index.html          ← 메인 페이지 (여러 이미지 동시 처리)
  obfuscator.js       ← 핵심 엔진

extension/            ← 브라우저 확장 (Chrome + Firefox 공용)
  manifest.json       ← MV3 매니페스트 (Chromium & Gecko 호환)
  obfuscator.js       ← 핵심 엔진 (web/과 동일)
  background.js       ← CORS 우회용 Service Worker
  content.js          ← 이미지 자동 감지 & 복호화
  popup.html          ← 설정 팝업

test/                 ← 확장 테스트용 페이지
  index.html          ← 자동 생성 테스트 이미지로 확장 검증
```

## 웹 서비스 사용법

1. `web/index.html`을 브라우저에서 열기 (또는 로컬 서버 사용)
2. 이미지를 **드래그 / 클릭 / Ctrl+V** 로 업로드 (여러 파일 동시 가능)
3. 키를 입력 (선택, 비워두면 기본 키)
4. **전체 난독화** 또는 **전체 복호화** 클릭
5. 결과를 **개별 또는 전체 다운로드** — 원본 파일명과 형식(JPEG/PNG/WebP) 유지

## 브라우저 확장 설치 & 테스트

하나의 확장 코드로 Chromium 계열과 Firefox 모두 지원합니다.

### 1단계: 확장 설치

#### Chrome / Edge / Brave (Chromium 계열)

1. 주소창에 확장 관리 페이지 입력
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. 우측 상단 **개발자 모드** 켜기
3. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
4. 이 저장소의 `extension/` 폴더 선택
5. "Anti-Zaiming" 확장이 목록에 나타나면 설치 완료

> 확장 코드를 수정한 후에는 확장 관리 페이지에서 🔄 버튼을 클릭하여 새로고침하세요.

#### Firefox

1. 주소창에 `about:debugging#/runtime/this-firefox` 입력
2. **"임시 부가 기능 로드..."** 클릭
3. `extension/` 폴더 안의 `manifest.json` 파일 선택
4. "Anti-Zaiming" 확장이 목록에 나타나면 설치 완료

> ⚠️ Firefox의 임시 부가 기능은 **브라우저를 닫으면 사라집니다.**
> 영구 설치하려면 `.xpi`로 패키징하거나 `about:config`에서 `xpinstall.signatures.required`를 `false`로 설정해야 합니다.
>
> Firefox **121 이상**이 필요합니다 (Manifest V3 Service Worker 지원).

### 2단계: 키 설정

1. 툴바에서 Anti-Zaiming 확장 아이콘 클릭
2. 팝업에서 키 입력 (난독화할 때 사용한 키와 동일하게)
3. **저장** 클릭

### 3단계: 테스트

#### 방법 A: 테스트 페이지 사용

```bash
# 프로젝트 루트에서 로컬 서버 시작
python -m http.server 8080

# 브라우저에서 열기
# http://localhost:8080/test/index.html
```

테스트 페이지에서:
- **테스트 1**: 기본 키(빈 문자열)로 난독화된 이미지 → 확장이 자동 복호화
- **테스트 2**: `hello` 키로 난독화된 이미지 → 확장의 키를 `hello`로 설정해야 복호화

난독화된 이미지가 원본과 동일하게 보이면 확장이 정상 동작하는 것입니다.

#### 방법 B: 수동 테스트

1. `web/index.html`에서 이미지 난독화 → 다운로드
2. 난독화된 이미지를 아무 웹페이지에 올리기
3. 해당 페이지 방문 → 확장이 자동 감지 & 복호화
4. 툴바 배지에 복호화된 이미지 수 표시됨

### 트러블슈팅

| 증상 | 확인 사항 |
|------|-----------|
| 복호화 안 됨 | 확장 팝업에서 키가 올바른지, 활성화 토글이 ON인지 확인 |
| 일부 사이트에서 작동 안 함 | CORS 제한이 매우 엄격한 사이트에서는 이미지 접근이 불가할 수 있음 |
| 확장 업데이트 후 반영 안 됨 | Chromium: 확장 관리 페이지에서 🔄 클릭 / Firefox: 임시 부가 기능 다시 로드 |
| Firefox에서 설치 안 됨 | Firefox 121 이상인지 확인 (`about:support`에서 버전 확인) |

## 알고리즘

- 시드 문자열을 **SHA-256**으로 해싱 → PRNG(Mulberry32) 시드
- 이미지를 **8×8 블록**으로 분할 (크기를 8의 배수로 맞춤)
- 각 블록에 **색반전 / 채널 회전 / 공간 회전 / 수평 플립** 적용 (PRNG 기반)
- **Fisher-Yates 셔플**로 블록 순서 재배치
- 하단 8px에 **매직 시그널** 삽입 (자동 감지용, JPEG 압축 내성)
- 결과 다운로드 시 원본과 동일한 파일 형식(JPEG/PNG/WebP)으로 저장

모든 변환은 **JPEG 재압축에 강한** 블록 단위 연산만 사용합니다.
