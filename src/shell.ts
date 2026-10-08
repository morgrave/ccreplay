import {
  createIcons,
  Play,
  Pause,
  FolderOpen,
  Download,
  Volume2,
  Maximize,
  SkipBack,
  SkipForward,
  Search,
  FileText,
  Users,
  Music2,
  Info,
  X,
  Plus,
  Monitor,
  Layers,
  ChevronRight,
  Check,
  Upload,
  PanelRightClose,
  MoreVertical,
} from "lucide";
const icons = {
  Play,
  Pause,
  FolderOpen,
  Download,
  Volume2,
  Maximize,
  SkipBack,
  SkipForward,
  Search,
  FileText,
  Users,
  Music2,
  Info,
  X,
  Plus,
  Monitor,
  Layers,
  ChevronRight,
  Check,
  Upload,
  PanelRightClose,
  MoreVertical,
};
export const ic = (n: string) =>
  `<i data-lucide="${n}" aria-hidden="true"></i>`;
export const paintIcons = () =>
  createIcons({ icons, attrs: { "stroke-width": 1.6 } });
type InputId =
  | "#seek"
  | "#speed"
  | "#master-volume"
  | "#search"
  | "#file"
  | "#repair-file"
  | "#episode-file"
  | "#episode-campaign"
  | "#campaign-title"
  | "#episode-title"
  | "#episode-date";
type ElementFor<S extends string> = S extends InputId
  ? HTMLInputElement
  : S extends "#dialog" | "#library-dialog"
    ? HTMLDialogElement
    : S extends "#episode-form"
      ? HTMLFormElement
      : S extends "#episode-prepare"
        ? HTMLButtonElement
        : HTMLElement;
export const $ = <S extends string>(s: S) =>
  document.querySelector(s) as ElementFor<S>;
export const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)];
export function shell() {
  $("#app").innerHTML = `
<main id="replay-page"><section class="viewer"><div class="stage" id="stage">
<div id="original" hidden><div id="dom-replay"></div><div id="replay-interaction"></div></div>

</div></section>
<aside class="inspector"><header class="chat-header"><button class="icon-button" id="close-chat" aria-label="채팅창 접기">${ic("panel-right-close")}</button><h2>룸 채팅</h2><button class="icon-button" id="chat-settings" aria-label="채팅 검색">${ic("search")}</button></header><div id="inspector-subtitle" class="inspector-subtitle"></div><div id="inspector-content" role="tabpanel"></div><div class="inspector-tabs" role="tablist"><button data-tab="chat" role="tab" class="selected" aria-selected="true">채팅 <span id="chat-count">0</span></button><button data-tab="tokens" role="tab" aria-selected="false">토큰 <span id="token-count">0</span></button></div><div id="search-wrap" class="search-wrap">${ic("search")}<input id="search" placeholder="전체 기록에서 채팅 검색" aria-label="전체 기록에서 채팅 검색"><kbd>/</kbd></div><div class="inspector-footer">메시지를 누르면 해당 시점으로 이동합니다.</div></aside>
<div class="replay-dock"><div class="timeline"><div class="timeline-line"><input id="seek" type="range" min="0" max="90000" value="0" step="100" aria-label="재생 위치"></div></div><div class="transport"><button class="icon-button" id="library-back" aria-label="캠페인 목록">${ic("layers")}</button><button class="icon-button" id="open" aria-label="파일 열기" title="파일 열기">${ic("folder-open")}</button><button class="icon-button" id="back" aria-label="10초 뒤로">${ic("skip-back")}</button><button class="play icon-button" id="play" aria-label="재생">${ic("play")}</button><button class="icon-button" id="forward" aria-label="10초 앞으로">${ic("skip-forward")}</button><span class="time" id="time-label">00:00 / 00:00</span><select id="speed" aria-label="재생 속도"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select><span class="dock-spacer"></span><button class="icon-button" id="volume-control" aria-label="리플레이 음량">${ic("volume-2")}</button><button class="icon-button" id="inspect-toggle" aria-label="채팅·토큰 찾아보기">${ic("search")}</button><button class="icon-button" id="export" aria-label="리플레이 파일 저장">${ic("download")}</button><button class="icon-button" id="record-nav" aria-label="기록기 설치 안내">${ic("info")}</button><button class="icon-button" id="fullscreen" aria-label="전체 화면">${ic("maximize")}</button><button class="icon-button" id="more" aria-label="리플레이 메뉴">${ic("more-vertical")}</button></div></div>
<div id="volume-panel" hidden><label for="master-volume">리플레이 음량</label><input type="range" id="master-volume" min="0" max="1" step=".05" value=".7"></div><div id="notice" role="status" hidden></div>
<div id="replay-menu" class="replay-menu" hidden><button id="help">기록 범위와 사용 안내</button><button id="menu-assets">보관된 파일 확인</button></div></main>
<main id="record-page" hidden><button class="button" id="replay-nav">리플레이로 돌아가기</button><section class="session-heading"><div><div class="eyebrow">CC REPLAY RECORDER</div><h1>방을 선택하고, 기록 시작.</h1><p>Windows 데스크톱 기록기에서 모든 공개 채팅 탭과 방의 변화를 기록하세요.</p></div><a class="button primary" href="https://github.com/morgrave/ccreplay/actions/workflows/desktop.yml" target="_blank" rel="noopener noreferrer">${ic("download")}Windows 기록기 받기</a></section><div class="setup-layout"><section class="setup-steps"><article><span class="step-number">01</span><div><h2>기록기 실행</h2><p>GitHub Actions의 성공한 <b>Build Windows recorder</b> 실행에서 <b>CCReplay-Recorder-Windows</b> 아티팩트를 내려받아 풀고 안의 <b>Windows.zip</b>도 폴더에 풀어주세요. <b>CCReplay Recorder.exe</b>를 더블 클릭합니다. 전용 브라우저가 포함되어 있습니다.</p><small>아티팩트 다운로드에는 GitHub 로그인이 필요합니다. EXE와 같은 폴더의 파일들을 함께 유지하세요.</small></div></article><article><span class="step-number">02</span><div><h2>방 선택과 기록 시작</h2><p>방 목록에서 방을 고르고 제목을 입력한 뒤 <b>기록 시작</b>을 누릅니다. <b>방 목록 설정 열기</b>에서 다른 방을 추가할 수 있습니다. 수집된 방 상태·채팅·BGM·자산의 진행 상황이 로그에 표시됩니다.</p></div></article><article><span class="step-number">03</span><div><h2>저장한 파일로 에피소드 등록</h2><p><b>종료하고 저장</b>을 누르면 앞뒤의 변화 없는 구간을 정리해 .ccreplay 파일을 만듭니다. 저장 폴더에서 파일을 찾아 에피소드를 등록하세요.</p><button class="button" id="setup-open">${ic("folder-open")}리플레이 파일 열기</button></div></article></section><aside class="capture-info"><div class="eyebrow">WHAT GETS SAVED</div><h2>시간별 방 상태와<br>모든 공개 채팅 탭.</h2><ul><li>${ic("layers")}배경·패널·토큰과 시간별 위치</li><li>${ic("users")}토큰 이름·메모·공개 상태값</li><li>${ic("file-text")}공개 채팅의 초기 대화와 변경 기록</li><li>${ic("music-2")}음원 파일·재생 위치·음량·반복</li><li>${ic("monitor")}코코포리아 스타일·방 상태 변화</li></ul><p>방은 백그라운드에서 준비되고 기록기에는 실시간 수집 로그가 표시됩니다.</p><div class="scope-note">시작 시 서비스가 로드한 대화와 이후 변화를 기록합니다. 과거 대화 전체나 비공개 정보를 가져오지는 않습니다. 기록하는 PC를 켜 두세요.</div><small>비공식 기록기 · 서비스 구조 변경 시 확인 필요</small></aside></div></main>
<input type="file" id="file" accept=".ccreplay,.zip,.json" hidden><input type="file" id="repair-file" hidden><dialog id="dialog"><div class="dialog-header"><h2 id="dialog-title"></h2><button id="dialog-close" class="icon-button" aria-label="닫기">${ic("x")}</button></div><div id="dialog-body"></div></dialog><div id="drop-overlay" hidden>${ic("upload")}리플레이 파일을 놓아주세요</div>`;
}
