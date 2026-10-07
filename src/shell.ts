import {
  createIcons,
  Play,
  Pause,
  FolderOpen,
  Download,
  Volume2,
  VolumeX,
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
  Minus,
  RotateCcw,
  Monitor,
  Layers,
  ChevronRight,
  Check,
  Upload,
  ChevronDown,
  PanelRightClose,
  MessageSquare,
  Settings,
  Film,
  MoreVertical,
} from "lucide";
const icons = {
  Play,
  Pause,
  FolderOpen,
  Download,
  Volume2,
  VolumeX,
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
  Minus,
  RotateCcw,
  Monitor,
  Layers,
  ChevronRight,
  Check,
  Upload,
  ChevronDown,
  PanelRightClose,
  MessageSquare,
  Settings,
  Film,
  MoreVertical,
};
export const ic = (n: string) =>
  `<i data-lucide="${n}" aria-hidden="true"></i>`;
export const paintIcons = () =>
  createIcons({ icons, attrs: { "stroke-width": 1.6 } });
type InputId =
  | "#seek"
  | "#speed"
  | "#volume"
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
<div class="scene-chrome"><header class="room-header"><button class="room-title" id="room-menu"><span id="session-title">CC Replay</span>${ic("chevron-down")}</button><span class="dicebot">DiceBot</span><span class="room-spacer"></span><button class="icon-button" data-tab="tokens" aria-label="토큰 목록">${ic("users")}</button><button class="icon-button" id="asset-info" aria-label="보관된 파일">${ic("layers")}</button><button class="icon-button" id="chat-toggle" aria-label="채팅창 열기">${ic("message-square")}</button></header>
<div class="audio-strip"><input id="volume" class="volume" type="range" min="0" max="1" step=".05" value=".7" aria-label="재생 음량"><button class="icon-button" id="mute" aria-label="음소거">${ic("volume-2")}</button><span id="bgm-name">재생 중인 BGM 없음</span><span id="bgm-detail" hidden></span><span class="audio-bars" hidden></span></div></div>
<div class="board-viewport" id="board"><div id="board-backdrop"></div><div class="board-world" id="world"></div></div>
<div id="original" hidden><div id="dom-replay"></div><div id="replay-interaction"></div></div>

<div class="scene-label" hidden><span id="scene-name"></span></div><div id="scene-hint" hidden></div><div id="token-tooltip" role="tooltip" hidden></div>
</div></section>
<aside class="inspector"><header class="chat-header"><button class="icon-button" id="close-chat" aria-label="채팅창 접기">${ic("panel-right-close")}</button><h2>룸 채팅</h2><button class="icon-button" id="chat-settings" aria-label="채팅 검색">${ic("search")}</button></header><div id="inspector-subtitle" class="inspector-subtitle"></div><div id="inspector-content" role="tabpanel"></div><div class="inspector-tabs" role="tablist"><button data-tab="chat" role="tab" class="selected" aria-selected="true">채팅 <span id="chat-count">0</span></button><button data-tab="tokens" role="tab" aria-selected="false">토큰 <span id="token-count">0</span></button></div><div id="search-wrap" class="search-wrap">${ic("search")}<input id="search" placeholder="전체 기록에서 채팅 검색" aria-label="전체 기록에서 채팅 검색"><kbd>/</kbd></div><div class="inspector-footer">메시지를 누르면 해당 시점으로 이동합니다.</div></aside>
<div class="replay-dock"><div class="timeline"><div class="timeline-line"><div id="event-marks"></div><input id="seek" type="range" min="0" max="90000" value="0" step="100" aria-label="재생 위치"></div><div id="ruler" hidden></div></div><div class="transport"><button class="icon-button" id="library-back" aria-label="캠페인 목록">${ic("layers")}</button><button class="icon-button" id="open" aria-label="파일 열기" title="파일 열기">${ic("folder-open")}</button><button class="icon-button" id="back" aria-label="10초 뒤로">${ic("skip-back")}</button><button class="play icon-button" id="play" aria-label="재생">${ic("play")}</button><button class="icon-button" id="forward" aria-label="10초 앞으로">${ic("skip-forward")}</button><span class="time" id="time-label">00:00 / 00:00</span><select id="speed" aria-label="재생 속도"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select><span class="dock-spacer"></span><button class="icon-button" id="volume-control" aria-label="리플레이 음량">${ic("volume-2")}</button><button class="icon-button" id="inspect-toggle" aria-label="채팅·토큰 찾아보기">${ic("search")}</button><button class="icon-button" id="export" aria-label="리플레이 파일 저장">${ic("download")}</button><button class="icon-button" id="record-nav" aria-label="기록기 설치 안내">${ic("info")}</button><button class="icon-button" id="fullscreen" aria-label="전체 화면">${ic("maximize")}</button><button class="icon-button" id="more" aria-label="리플레이 메뉴">${ic("more-vertical")}</button></div></div>
<div id="volume-panel" hidden><label for="master-volume">리플레이 음량</label><input type="range" id="master-volume" min="0" max="1" step=".05" value=".7"></div><div id="notice" role="status" hidden></div><div hidden><span id="eyebrow"></span><span id="session-meta"></span><span id="sample-badge"></span><span id="duration-label"></span></div>
<div id="replay-menu" class="replay-menu" hidden><button id="load-demo">예시 리플레이 열기</button><button id="help">기록 범위와 사용 안내</button><button id="menu-assets">보관된 파일 확인</button></div></main>
<main id="record-page" hidden><button class="button" id="replay-nav">리플레이로 돌아가기</button><section class="session-heading"><div><div class="eyebrow">CAPTURE YOUR SESSION</div><h1>이야기가 시작되기 전에, 기록 시작.</h1><p>Chrome 또는 Edge에서 코코포리아 방을 열고 기록기를 실행하세요.</p></div><a class="button primary" href="./ccreplay-recorder.zip" download>${ic("download")}기록기 다운로드</a></section><div class="setup-layout"><section class="setup-steps"><article><span class="step-number">01</span><div><h2>기록기 설치</h2><p>다운로드한 ZIP을 폴더에 풀고, Chrome의 확장 프로그램 관리 화면에서 <b>개발자 모드</b>를 켜세요. <b>압축해제된 확장 프로그램을 로드합니다</b>를 누르고 해당 폴더를 선택합니다.</p><code>chrome://extensions</code><small>Edge에서는 edge://extensions</small></div></article><article><span class="step-number">02</span><div><h2>방에서 기록 시작</h2><p>코코포리아 방을 열고 확장 프로그램의 <b>기록 시작</b>을 누르세요. 표시된 장면·토큰, 수신한 채팅, 실제 재생되는 BGM을 기록합니다.</p><a class="button" href="https://ccfolia.com/rooms/3I0wcF7Mh" target="_blank" rel="noopener noreferrer">코코포리아 방 열기${ic("monitor")}</a></div></article><article><span class="step-number">03</span><div><h2>파일 저장, 그리고 리플레이</h2><p><b>기록 종료 → 리플레이 파일 저장</b> 순서로 누른 뒤 이 사이트에서 .ccreplay 파일을 열면 됩니다. 파일을 가진 사람은 저장된 정보를 볼 수 있어요.</p><button class="button" id="setup-open">${ic("folder-open")}리플레이 파일 열기</button></div></article></section><aside class="capture-info"><div class="eyebrow">WHAT GETS SAVED</div><h2>장면은 그대로,<br>정보는 다시 살펴보게.</h2><ul><li>${ic("layers")}배경·패널·토큰과 시간별 위치</li><li>${ic("users")}토큰 이름·메모·공개 상태값</li><li>${ic("file-text")}수신한 채팅·수정·삭제 시점</li><li>${ic("music-2")}음원 파일·재생 위치·음량·반복</li><li>${ic("monitor")}코코포리아 스타일·방 상태 변화</li></ul><p>코코포리아의 DOM·CSS와 상태 변화를 기록합니다. 화면 영상은 녹화하지 않으며 BGM은 음원 파일로 보존합니다.</p><div class="scope-note">기록 이후, 이 브라우저에서 보거나 받은 정보만 남습니다. 기록 전의 움직임과 다른 참가자에게만 보이는 내용은 복원할 수 없습니다. 기록 중 탭을 새로고침하거나 닫으면 종료됩니다.</div><small>코코포리아 1.37.4 구조 기준 · 비공식 기록기</small></aside></div></main>
<input type="file" id="file" accept=".ccreplay,.zip,.json" hidden><input type="file" id="repair-file" hidden><dialog id="dialog"><div class="dialog-header"><h2 id="dialog-title"></h2><button id="dialog-close" class="icon-button" aria-label="닫기">${ic("x")}</button></div><div id="dialog-body"></div></dialog><div id="drop-overlay" hidden>${ic("upload")}리플레이 파일을 놓아주세요</div>`;
}
