# CC Replay

코코포리아 방을 기록하고 **캠페인 → 에피소드 → 방 상태 리플레이**로 탐색하는 비공식 도구입니다. GitHub Pages에 배포하는 정적 사이트이며, 브라우저에서 파일을 선택하는 것만으로 GitHub에 업로드되지는 않습니다.

## GitHub Pages 자동 배포

이 폴더가 Git 저장소와 npm 프로젝트의 루트입니다. 설치와 아래 명령은 모두 이 폴더에서 실행합니다. `.github/workflows/pages.yml`이 `dist/`를 배포합니다.

```powershell
npm ci
npm run build
npm run dev
```

로컬 주소는 `http://127.0.0.1:4173/`입니다. 서버는 `dist/`를 제공하므로 소스를 수정하면 `npm run build` 후 페이지를 새로고침하세요. 검증 명령은 `npm test`, `npm run typecheck`, `npm run library:check`입니다.

1. GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
2. `main` 또는 `master` 브랜치에 푸시합니다. 테스트 → 라이브러리 무결성 검사 → 빌드 → Pages 배포가 자동 실행됩니다.
3. 이후 코드나 `public/library` 변경을 푸시하면 다시 배포됩니다. Actions의 수동 실행도 지원합니다.

Pages에는 앱과 기록기만 배포합니다. 목록·에피소드·공용 자산는 `https://raw.githubusercontent.com/<owner>/<repo>/<배포 커밋>/public/`에서 직접 읽습니다. Actions가 `CCREPLAY_DATA_BASE`를 설정하며, 커밋 주소에 고정해 목록과 자산의 버전이 섞이지 않게 합니다. `dist`에는 라이브러리 기록을 복사하지 않습니다. 로컬 서버에서는 `public`의 데이터를 직접 제공합니다.

기본 브랜치 이름이 다르면 workflow의 `branches: [main, master]`을 수정하세요. 별도 PAT/배포 비밀키는 필요하지 않습니다. 자동 배포에는 GitHub의 기본 `GITHUB_TOKEN`과 Pages OIDC를 사용합니다. 저장소 하위 경로(`https://user.github.io/repository/`)에서도 작동하도록 파일 경로는 상대 경로, 화면 탐색은 URL hash를 사용합니다. [GitHub 공식 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 캠페인과 에피소드 등록

**사이트에서 등록 묶음 만들기:** `에피소드 등록`에서 `.ccreplay` 파일, 캠페인, 제목, 날짜를 선택합니다. 새 자산만 포함된 ZIP을 내려받고 프로젝트에서 적용합니다.

```powershell
npm run library:apply -- "C:\Downloads\1화.ccreplay-add.zip"
git add public/library
git commit -m "Add episode 1"
git push origin main
```

**기록 파일을 바로 등록하기:**

```powershell
npm run library:import -- "C:\Records\1화.ccreplay" --campaign "우리 캠페인" --title "1화 · 첫 만남" --date 2026-10-07
npm run library:check
```

같은 캠페인 이름으로 다음 회차를 등록하면 기존 캠페인에 추가됩니다. 동명 캠페인이 여러 개면 `--campaign-id`를 지정하세요. 사이트에 표시되기 전 로컬에서 확인하려면 `npm run build` 후 `npm run dev`를 실행합니다.

## 공용 자산 저장 구조

캠페인 목록에서는 `index.json`만 요청합니다. 에피소드를 선택하면 기록 데이터와 CSS·SVG를 읽은 뒤 방을 표시합니다. 단일 조각 이미지·폰트·음원은 저장소 Raw URL에서 브라우저가 직접 로딩하므로 모든 자산의 다운로드를 기다리지 않습니다. 여러 조각으로 나뉜 큰 파일은 해시를 검사해 결합한 뒤 사용합니다. 목록으로 돌아가거나 다른 회차로 이동하면 진행 중인 준비 요청을 취소합니다.

```text
public/library/
  index.json                    # 캠페인 / 에피소드 목록
  episodes/<episode-id>.ccreplay # 사건·채팅·DOM·BGM 시점 + 자산 참조
  assets/<sha256>                # 여러 회차가 공유하는 원본 바이트 조각
```

- 이미지·음악·CSS·폰트는 **내용의 SHA-256**으로 식별합니다. 주소가 달라도 내용이 같으면 한 번 저장하며, 같은 주소의 내용이 바뀌면 다른 자산으로 보존합니다.
- 큰 자산은 20 MiB 조각으로 나눕니다. 여러 조각 자산은 재생 때 조각과 전체 파일의 해시를 확인해 결합합니다. 단일 조각 자산은 배포 전 무결성 검사 후 커밋에 고정한 Raw URL을 사용합니다. 독립 리플레이 파일로 내보낼 때에는 자산 바이트를 내려받아 해시를 확인합니다. 등록할 때 원본 CSS 바이트를 저장하며 Blob URL로 치환한 재생용 CSS를 저장하지 않습니다.
- 등록 묶음은 추가 항목만 담습니다. 오래된 캠페인 목록에서 만든 묶음도 최신 목록과 병합하고, 같은 묶음을 다시 적용해도 회차를 중복 생성하지 않습니다. 기존 자산을 자동 삭제하지 않습니다.
- 기록기는 기존처럼 독립적으로 열 수 있는 완전한 `.ccreplay`를 내보냅니다. **저장소에 등록하는 단계에서** 자산을 분리하므로 그 원본 파일을 저장소에 함께 커밋할 필요는 없습니다. 재생기의 저장 버튼은 다시 자산 포함 독립 파일로 내보냅니다.
- 얇은 회차는 `assetStorage: "sha256-chunks-v1"`을 명시합니다. 해당 회차를 단독으로 열면 공용 자산이 필요하다는 안내를 표시합니다. 기존 v1 전체 파일도 계속 지원합니다.
- 라이브러리는 Git 저장소에 보관하고 Raw URL에서 읽으므로 Pages 배포 용량에 포함되지 않습니다. 자산 조각은 20 MiB, 에피소드 기록 파일은 95 MiB 이하이며, 한 회차를 열 때의 자산 합계는 1 GiB 이하로 제한합니다.

공개 GitHub Pages에 게시하는 기록은 방문자가 내려받을 수 있습니다. 사이트의 재생/등록 화면에는 비밀키나 GitHub 토큰을 입력하지 않습니다.

## 실행

```powershell
npm install
npm run build
npm run dev
```

http://127.0.0.1:4173 에서 재생기를 엽니다. `npm test`로 시간 이동, 오디오 시점, 파일 왕복, 비공개 정보 필터, 업로드 보안, 장시간 저장 테스트를 실행합니다.

## 기록

1. `dist/ccreplay-recorder.zip`을 풉니다. Chrome/Edge의 `chrome://extensions` 또는 `edge://extensions`에서 개발자 모드를 켜고 폴더를 압축해제 확장으로 로드합니다. `dist/recorder` 폴더를 직접 선택해도 됩니다.
2. 코코포리아 방을 완전히 연 뒤 확장 프로그램의 **기록 시작**을 누릅니다.
4. **기록 종료 → 리플레이 파일 저장**을 누릅니다. 다운로드가 완료되기 전에는 새 기록을 시작할 수 없습니다.
5. **파일 바로 열기** 또는 캠페인의 에피소드를 선택합니다. 해당 시점의 방 상태를 현재 창 크기에 맞게 표시합니다. 맵 이동·확대·토큰 메모·채팅 검색을 기본으로 지원하며 기록자의 시점과 마우스 동작은 따라가지 않습니다. 재생 바는 화면 하단에 고정됩니다.

## 기록 형식

ZIP 컨테이너에 `recording.json`과 `assets/*`를 저장합니다. `format: ccreplay`, `version: 1`입니다. 시각은 기록 시작 기준 밀리초이며 `startedAt`은 Unix epoch 밀리초입니다.

- `frames`: 방/배경/패널/토큰의 허용된 표시 필드 전체 스냅샷
- `messages`: 메시지 최초 수신, 수정, 삭제 이벤트
- `audio`: 실제 재생기의 URL, currentTime, volume/gain, loop, paused, playbackRate 및 정지 이벤트
- `events`: rrweb DOM 이벤트와 스냅샷
- `assets`: 원래 URL, 파일 경로, MIME, 크기 목록
- `warnings`: 연결 실패와 다운로드 누락

음원 URL을 처음 관측했을 때 다운로드를 시작합니다. 같은 URL의 파일은 한 번만 저장합니다. 재생 시 코코포리아의 원래 주소를 다시 요청하지 않습니다. 캠페인 회차는 저장소 Raw URL의 보관본을 사용하고, 독립 파일은 포함된 자산을 사용합니다. 스크립트·외부 iframe 의존성은 수집하지 않습니다. 누락 자산은 재생기의 **보관된 파일 확인 → 파일 연결**로 보완하여 새 파일로 저장할 수 있습니다.

## 범위와 제한

- 코코포리아 **1.37.4**의 공개 배포 소스맵으로 확인한 내부 구조를 사용합니다. 공식 API가 아니므로 서비스 업데이트 후 호환성 확인이 필요합니다.
- 기록 당시 이 브라우저가 받은 정보만 대상입니다. 기록 전 토큰 이동과 전체 과거 채팅은 복원하지 않습니다. 코코포리아 초기 채팅 로딩은 최신 일부 메시지뿐입니다.
- 실제 사용자 브라우저에 확장 프로그램을 설치한 실방 통합 테스트는 별도로 필요합니다. 자동 테스트와 로컬 재생기 검증을 통과했다고 모든 세션의 완전한 보존을 보증하지 않습니다.
- 계정/인증 정보와 전체 Redux store를 저장하지 않습니다. 토큰의 공개 표시 필드만 저장합니다. 타인 DM·참여하지 않은 비공개 채널·비공개 주사위 원문·닫힌 카드 앞면은 제외합니다. 기록자에게 보이는 비공개 채팅은 포함될 수 있으므로 파일 공유에 주의하세요.
- 입력 중인 텍스트는 마스킹합니다. 화면 영상 녹화 기능은 제공하지 않습니다.
- 방 보기는 기록된 코코포리아 DOM·CSS·폰트를 사용합니다. 별도 디자인의 보드를 다시 그리지 않습니다.
- Chrome/Edge 116 이상이 필요합니다. 브라우저 종료나 탭 새로고침은 연속 기록을 중단합니다. IndexedDB에 기록 청크를 저장하지만 강제 종료 직전 전송 중 데이터는 잃을 수 있습니다.
- 자산 허용 호스트: ccfolia.com 및 하위 도메인, firebasestorage.googleapis.com, storage.googleapis.com, firebasestorage.app 하위 도메인, fonts.googleapis.com, fonts.gstatic.com. 기타 호스트·권한 제한·만료된 주소는 누락으로 표시합니다.
- 개별 자산 150 MB, 자산 누적 700 MB, 재생 파일 1 GB 제한입니다. 긴 세션은 나누어 저장하세요. 내보내기는 메모리에서 ZIP을 조립하므로 큰 파일은 메모리 여유가 필요합니다.
- 오디오 변경은 네이티브 이벤트와 50ms 위치/게인 샘플을 사용합니다. 브라우저가 절전 상태가 되거나 백그라운드 타이머를 제한하면 시간 정밀도가 낮아질 수 있습니다.

## 구조

앱·기록기·스크립트·테스트 소스는 TypeScript로 통일되어 있습니다. `npm run typecheck`는 이 네 디렉터리 모두를 `strict: true`로 검사합니다. `npm run build`도 타입 검사를 먼저 실행합니다. 브라우저가 실행하는 JavaScript는 `dist/`에만 생성합니다.

- `src/main.ts`: 재생 화면과 재생 시계 연결
- `src/replay/`: 코코포리아 채팅·툴팁·재생 바 상호작용
- `src/core/`: 기록 형식, 시간별 상태, 오디오, ZIP, 공용 자산, 카메라
- `extension/`: Chrome MV3 기록기. 설치할 때는 빌드 결과인 `dist/recorder/`를 사용합니다.
- `scripts/`: `tsx`로 실행하는 빌드·서버·라이브러리 관리 도구
- `tests/`: TypeScript 자동 검증
- `public/library/`: 배포할 캠페인 목록·회차 기록·중복 제거한 공용 자산
- `work/`: Git과 배포에서 제외하는 조사·비교·임시 자료

공유 데이터 타입은 `src/core/types.ts`와 `src/replay/types.ts`에 있습니다. 코코포리아 내부 객체와 rrweb의 동적 데이터 경계에는 `ExternalRecord`를 사용하며, 파일 입력 검증은 런타임에도 수행합니다. `scripts/build.ts`는 정적 사이트와 확장 프로그램 ZIP을 생성합니다.

`package.json`과 `package-lock.json`이 단일 프로젝트의 설치를 관리합니다. 별도의 워크스페이스나 중첩 프로젝트는 없습니다. `src/replay/tools.ts`는 선택적 브라우저 도구 연동을 담당하며 재생 상태는 `main.ts`가 소유합니다.

조사 자료는 `work/research/`, 검증 자료는 `work/qa/`에 보관합니다. `work/`, `dist/`, 기존 `.openai/` 호스팅 설정과 소스 ZIP은 Git에서 제외하며 배포 입력으로 사용하지 않습니다.

공개 기술 근거: https://github.com/rrweb-io/rrweb

## 샘플 캠페인

샘플 목록에는 페리아의 문장 / 엔딩 이후가 등록되어 있습니다. 임시 스냅샷인 엔딩 이후2는 목록에서 제거했습니다.

화면 영상 녹화와 tabCapture 권한은 제거되었습니다. BGM 파일과 재생 시점 기록은 유지됩니다. 3D 캔버스와 외부 iframe 내부는 DOM 기록으로 복원되지 않습니다.

엔딩 이후는 23초 분량의 실제 기록입니다. 누락되었던 CDN 자산을 원본 주소에서 복구했습니다.

재생 바를 조작하는 동안에는 손잡이·시간 표시만 미리 갱신하고, 마우스 또는 키를 놓을 때 방과 BGM을 한 번 복원합니다. 재생 중이었다면 선택한 시점부터 다시 재생합니다. 채팅 탭과 접힘 상태는 기록자의 조작을 따르지 않으며, 선택한 시점까지 수신한 메시지를 조회합니다. 기록되지 않은 과거 채팅을 새로 가져오지는 않습니다.

새 기록은 `room-state` 방식입니다. 토큰·패널·배경·채팅·BGM 변화를 저장하며 기록자의 마우스 이동·클릭·스크롤·시점·해상도는 재생하지 않습니다. DOM·CSS는 코코포리아의 외형을 보존하는 템플릿으로 유지합니다. 재생 화면은 현재 플레이어의 창 크기로 배치하며 카메라는 독립적으로 조작합니다. 기존 기록에도 같은 표시 방식을 적용합니다. 아직 브라우저에 로드되지 않은 비공개·숨김 데이터까지 수집하는 방식은 아닙니다.
