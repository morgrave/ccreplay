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

Pages에는 웹 재생기만 배포합니다. 목록·에피소드·공용 자산은 `https://raw.githubusercontent.com/<owner>/<repo>/<배포 커밋>/public/`에서 직접 읽습니다. Actions가 `CCREPLAY_DATA_BASE`를 설정하며, 커밋 주소에 고정해 목록과 자산의 버전이 섞이지 않게 합니다. `dist`에는 라이브러리 기록을 복사하지 않습니다. 로컬 서버에서는 `public`의 데이터를 직접 제공합니다.

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

## 재생 사이트 개발

```powershell
npm ci
npm run build
npm run dev
```

http://127.0.0.1:4173 에서 재생기를 엽니다. `npm test`는 파일 왕복·저장·복구·앞뒤 자르기·상태 조회·입력 검증을 검사하고, `npm run test:recorder`는 설치된 Chromium의 모의 방에서 채팅 탭, 토큰 이동, BGM 재생·정지를 검증합니다.

## Windows 데스크톱 기록기

`CCReplay-Recorder-0.2.0-Windows.zip`을 폴더에 풀고 안의 **CCReplay Recorder.exe**를 더블 클릭하면 터미널 없이 기록할 수 있습니다. 전용 Chromium이 포함되어 있어 Node.js나 브라우저를 별도로 설치하지 않아도 됩니다. EXE와 같은 폴더의 파일들을 함께 유지하세요. 배포 ZIP은 `release/`에 만들어지며, GitHub Actions의 **Build Windows recorder** 실행 결과에서 `CCReplay-Recorder-Windows` 아티팩트를 내려받을 수도 있습니다. Actions 아티팩트를 풀면 안에 배포 ZIP이 있으며 이것도 풀어서 실행합니다. 실행 파일과 Chromium은 Pages 웹 배포에 포함되지 않습니다.

1. 방 목록에서 방을 선택하고 에피소드 제목을 입력합니다.
2. **기록 시작**을 누르면 공개 방에 접속하고 모든 공개 채팅 탭의 초기 대화를 준비합니다. 방 상태 저장, 채팅 탭별 수집, BGM 재생·정지 변화가 실시간 로그에 표시됩니다. 자산 저장·대기·실패 건수와 받은 용량도 갱신됩니다.
3. **종료하고 저장**을 누르면 마지막 기록과 자산을 저장해 `.ccreplay`를 만듭니다. 최대 기록 시간(기본 24시간)에 도달해도 자동 저장합니다. **0을 입력하면 시간 제한 없이 기록**하며 종료 버튼이나 창 닫기로 저장합니다. 앞뒤 무변화 구간 정리는 기본으로 켜져 있고 여유 시간을 조절할 수 있습니다.
4. **저장 폴더 열기**에서 파일을 찾아 사이트의 에피소드 등록에 사용합니다. 기본 위치는 EXE 옆의 `recordings` 폴더입니다.

**방 목록 설정 열기**는 EXE 옆 `resources/record.config.json`을 엽니다. 이 파일을 직접 편집하고 저장한 뒤 **설정 다시 읽기**를 누르거나 EXE를 재실행하면 방 목록에 반영됩니다. 설정과 저장 위치는 창 아래에 표시됩니다. **저장 위치 변경**으로 고른 경로는 같은 `resources/preferences.json`에 저장되며 다음 실행에도 유지됩니다. 앱 캐시는 EXE 옆 `.runtime` 폴더에 둡니다. 개발 실행에서는 저장소 루트의 `record.config.json`을 직접 읽습니다. 배포 ZIP을 업데이트할 때에는 편집한 설정 파일과 기록 파일을 보존하세요.

```json
{
  "version": 1,
  "defaults": { "duration": 86400, "trim": true, "padding": 5 },
  "rooms": [
    {
      "id": "feria",
      "name": "페리아의 문장",
      "url": "https://ccfolia.com/rooms/ewqvsiQk4",
      "title": "엔딩 이후"
    }
  ]
}
```

`duration`과 `padding`은 초 단위입니다. 방별 설정이 `defaults`보다 우선하고 창에서 변경한 값이 해당 기록에 적용됩니다. 방 id는 영문·숫자·하이픈·밑줄로 중복 없이 지정합니다. 저장 폴더는 창에서 선택하므로 JSON에는 저장 경로를 넣지 않습니다.

창을 닫으면 기록 저장을 마친 뒤 종료합니다. 강제 종료나 컴퓨터 재시작으로 중단된 경우 **중단된 기록 복구**에서 `.ccreplay.session` 폴더를 선택하면 마지막 디스크 저장 시점까지의 리플레이를 만들 수 있습니다. 기존 파일을 덮어쓰지 않으므로 새 파일 이름을 지정하세요. 이 폴더는 원본 전체 기록을 보관하므로 결과 파일을 확인한 뒤 보관 여부를 결정할 수 있습니다.

최근 로그 300줄만 화면에 유지하고 실제 기록은 디스크에 계속 저장합니다. 채팅 건수는 고유 메시지 수가 아니라 초기 대화·새 메시지·수정의 저장 건수이며 BGM 이벤트 건수에는 재생 위치 갱신도 포함됩니다. 방 화면이나 화면 영상은 기록기 창에 표시하지 않습니다.

개발 및 Windows 실행 파일 빌드:

```powershell
npm ci
npm run desktop:install
npm run desktop:dev
npm run desktop:package
```

## 기록 범위와 앞뒤 정리

계정 로그인 없이 공개 방에 접속하는 전용 Chromium을 사용합니다. 원본 서비스의 구독을 통해 방 상태와 모든 공개 채팅 탭의 새 메시지·수정·삭제를 계속 관찰합니다. 기록 시작 전에 각 공개 탭을 선택해 초기 대화를 준비하며, 이후 새로 추가된 탭도 주기적으로 준비합니다. 과거 대화 전체를 무제한 다운로드하는 기능은 아닙니다. 서비스가 해당 탭에 로드한 대화가 초기 상태에 포함됩니다. 비공개 그룹이나 접근 권한이 없는 정보는 수집하지 않습니다.

토큰·패널·배경·채팅·BGM 변화를 저장하고 기록자의 마우스 이동·클릭·스크롤·카메라·해상도를 재생하지 않습니다. DOM·CSS는 코코포리아 외형의 템플릿으로 보존합니다. 재생 화면은 현재 창 크기로 배치하고 카메라와 채팅 탭은 자유롭게 조작합니다. 3D 캔버스와 외부 iframe 내부는 DOM 기록으로 복원되지 않습니다. 비공식 도구이므로 코코포리아 서비스 구조가 변경되면 수집기 확인이 필요합니다.

앞뒤 정리는 방 상태 변경, 채팅 변경, BGM 재생·정지·음량·음원 변경을 기준으로 합니다. 최초 상태, 단순 DOM 애니메이션, BGM 재생 위치의 주기적 갱신은 활동으로 세지 않습니다. 첫 변화 이전과 마지막 변화 이후를 설정한 여유 시간만큼 남기며 세션 도중의 공백은 유지합니다. 변화가 전혀 없으면 초기 상태와 여유 시간만 남깁니다. 자른 시작점에서 채팅·토큰·BGM 위치를 복원합니다. 마이크 음성만 진행되는 세션은 방 상태 변화로 인식하지 않으므로 정리를 끄세요.

이미지·음악·CSS·폰트 파일도 저장합니다. 스크립트는 저장하지 않습니다. 다운로드 실패는 파일과 기록기 로그의 상태에 남습니다. 개별 자산은 150 MiB, 누적 다운로드는 700 MiB, 기록 저널은 256 MiB로 제한됩니다. ZIP 생성은 메모리를 사용하므로 큰 회차는 나누어 저장하세요. 기록 PC가 꺼지거나 절전되면 실시간 수집이 중단됩니다.

## 프로젝트 구조

소스는 TypeScript로 통일되어 있고 `npm run typecheck`가 전체를 strict 모드로 검사합니다.

- `desktop/`: Windows 기록기 창, 제한된 IPC API, 기록 작업 관리
- `recorder/`: 전용 브라우저 실행, 방 상태·DOM·CSS 수집, 채팅 탭 준비, 디스크 저널·자산 저장·복구
- `src/main.ts`, `src/replay/`: 웹 재생 화면과 코코포리아 상호작용
- `src/core/`: 기록 형식, 시간별 상태, 오디오, ZIP, 공용 자산, 카메라
- `scripts/`: 웹·데스크톱 빌드, 개발 서버, 라이브러리 관리
- `tests/`: 자동 검증
- `public/library/`: 캠페인 목록, 회차 기록, 중복 제거한 공용 자산
- `dist/`, `desktop-dist/`, `release/`: 웹·데스크톱 생성물. Git에서 제외
- `work/`, `recordings/`: 로컬 조사·검증·기록 결과. Git과 배포에서 제외

브라우저 확장 프로그램과 터미널 기록 명령은 제거했습니다. 기록 방식은 데스크톱 기록기로 통일합니다. `scripts/build.ts`는 웹 재생기만 만들고 `scripts/build-desktop.ts`와 `scripts/package-desktop.ts`는 Windows 기록기를 만듭니다. 단일 루트의 `package.json`과 `package-lock.json`으로 의존성을 관리합니다.

공유 타입은 `src/core/types.ts`, `src/replay/types.ts`, `desktop/types.ts`에 있습니다. 코코포리아 내부 객체와 rrweb의 동적 데이터 경계에는 `ExternalRecord`를 사용하고 파일 입력은 런타임에도 검증합니다. 코코포리아 외형 보존에는 [rrweb](https://github.com/rrweb-io/rrweb)을 사용합니다.

## 샘플 캠페인

샘플 목록에는 **페리아의 문장 / 엔딩 이후**가 등록되어 있습니다. 엔딩 이후는 23초 분량의 실제 기록이며, 누락되었던 CDN 자산을 원본 주소에서 복구했습니다. 임시 회차 엔딩 이후2는 제거했습니다.

재생 바를 움직이는 동안 손잡이와 시간 표시를 갱신하고, 조작을 마칠 때 방과 BGM을 한 번 복원합니다. 채팅 탭과 접힘 상태는 플레이어가 선택한 상태를 유지합니다. 기록되지 않은 과거 채팅을 새로 가져오지는 않습니다.
