import { errorMessage } from "./core/errors.ts";
import { dataURL } from "./core/data-source.ts";
import type { Recording, PreparedEpisode } from "./core/types.ts";
import { $, ic, paintIcons } from "./shell.ts";
import { escapeHTML as esc, timeLabel } from "./core/model.ts";
import { readArchive, downloadBlob } from "./core/archive.ts";
import {
  emptyCatalog,
  validateCatalog,
  prepareEpisode,
  patchBlob,
  loadEpisode,
} from "./core/library.ts";
const mb = (n: number) =>
  n < 1024 * 1024
    ? (n / 1024).toFixed(1) + " KB"
    : (n / 1024 / 1024).toFixed(1) + " MB";
export function mountLibrary({
  load,
  pause,
  showReplay,
  showRecord,
  openFile,
}: {
  load: (recording: Recording) => Promise<void>;
  pause: () => void;
  showReplay: () => void;
  showRecord: () => void;
  openFile: () => void;
}) {
  const base = dataURL("library/");
  let catalog = emptyCatalog(),
    campaign: string | null = null,
    pending: boolean | null = null,
    prepared: PreparedEpisode | null = null,
    navSerial = 0;
  let loadingController: AbortController | null = null;
  document.querySelector("#app")!.insertAdjacentHTML(
    "beforeend",
    `<main id="library-page"><header class="library-header"><button class="library-brand" id="library-home">${ic("play")}CC REPLAY</button><span class="library-header-space"></span><button class="button" id="library-local">${ic("folder-open")}파일 바로 열기</button><button class="button primary" id="library-add">${ic("plus")}에피소드 등록</button><button class="icon-button" id="library-recorder" aria-label="기록기 설치 안내">${ic("info")}</button></header><div class="library-body"><div class="library-breadcrumb" id="library-breadcrumb"></div><div class="library-heading"><div><span class="library-eyebrow">CAMPAIGN LIBRARY</span><h1 id="library-title">캠페인</h1><p id="library-description">같은 방에서 이어지는 이야기를 회차별로 모아보세요.</p></div><span id="library-total"></span></div><div id="library-status" role="status"></div><div id="library-list"></div><footer class="library-footer"><span>공용 자산은 한 번 저장하고 여러 에피소드에서 재사용합니다.</span></footer></div></main>
 <dialog id="library-dialog"><div class="dialog-header"><h2>에피소드 등록</h2><button class="icon-button" id="library-dialog-close" aria-label="등록 창 닫기">${ic("x")}</button></div><form id="episode-form"><label class="field-label">기록 파일<input id="episode-file" type="file" accept=".ccreplay,.zip" required></label><label class="field-label">캠페인<select id="episode-campaign"></select></label><label class="field-label" id="campaign-title-wrap">새 캠페인 이름<input id="campaign-title" maxlength="200" placeholder="캠페인 이름"></label><div class="form-pair"><label class="field-label">에피소드 제목<input id="episode-title" maxlength="200" required placeholder="1화 · 첫 만남"></label><label class="field-label">플레이한 날짜<input id="episode-date" type="date" required></label></div><p class="publish-explanation">GitHub Pages용 등록 묶음을 만듭니다. 프로젝트에 적용하고 커밋하면 캠페인 목록에 게시됩니다.</p><button class="button primary" id="episode-prepare" type="submit">등록 묶음 만들기</button><div id="episode-status" role="status"></div></form><div id="episode-result" hidden></div></dialog>`,
  );
  const status = (msg: string) => ($("#library-status").textContent = msg);
  $("#replay-page").insertAdjacentHTML(
    "beforeend",
    `<section id="episode-loading" hidden aria-live="polite"><div><span class="library-eyebrow">EPISODE</span><h1 id="episode-loading-title"></h1><p id="episode-loading-status"></p><progress id="episode-loading-progress" max="1" aria-label="에피소드 자산 로딩"></progress><div class="episode-loading-actions"><button class="button" id="episode-loading-back">캠페인 목록으로</button><button class="button primary" id="episode-loading-retry" hidden>다시 시도</button></div></div></section>`,
  );
  const episodeStatus = (message: string) =>
    ($("#episode-loading-status").textContent = message);
  function setLoading(visible: boolean) {
    const overlay = $("#episode-loading");
    overlay.hidden = !visible;
    for (const child of $("#replay-page").children) {
      if (child !== overlay && child instanceof HTMLElement)
        child.inert = visible;
    }
  }
  $("#episode-loading-back").onclick = () => back();
  $("#episode-loading-retry").onclick = () => navigate();
  function show() {
    pause();
    $("#library-page").hidden = false;
    $("#replay-page").hidden = true;
    $("#record-page").hidden = true;
    setLoading(false);
    render();
  }
  function render() {
    const c = catalog.campaigns.find((c) => c.id === campaign);
    $("#library-title").textContent = c?.title || "캠페인";
    $("#library-description").textContent = c
      ? `${c.episodes.length}개의 에피소드 · 날짜순`
      : "같은 방에서 이어지는 이야기를 회차별로 모아보세요.";
    $("#library-breadcrumb").innerHTML = c
      ? '<button id="all-campaigns">캠페인 목록</button><span>/</span><span>' +
        esc(c.title) +
        "</span>"
      : "";
    if (c)
      $("#all-campaigns").onclick = () => {
        location.hash = "library";
      };
    $("#library-total").textContent = c
      ? ""
      : `${catalog.campaigns.length} 캠페인 · ${catalog.campaigns.flatMap((x) => x.episodes).length} 에피소드`;
    $("#library-list").innerHTML = c
      ? c.episodes
          .map(
            (e, i) =>
              `<button class="episode-row" data-episode="${esc(e.id)}"><span class="episode-number">${String(i + 1).padStart(2, "0")}</span><span class="episode-info"><strong>${esc(e.title)}</strong><span>${esc(e.date)} · ${e.sampleKind === "snapshot" ? "화면 스냅샷 샘플" : timeLabel(e.duration)} · 자산 ${e.assetCount || 0}개</span></span><span class="episode-play">${ic("play")}재생</span></button>`,
          )
          .join("") ||
        '<div class="library-empty"><h2>첫 에피소드를 등록하세요</h2><p>이 캠페인의 기록 파일을 추가해보세요.</p></div>'
      : catalog.campaigns
          .map(
            (c) =>
              `<button class="campaign-card" data-campaign="${esc(c.id)}"><div class="campaign-symbol">${ic("layers")}</div><div><h2>${esc(c.title)}</h2><p>${c.episodes.length} 에피소드${c.episodes.length ? " · " + esc(c.episodes[c.episodes.length - 1].date) : ""}</p></div><span>${ic("chevron-right")}</span></button>`,
          )
          .join("") ||
        `<div class="library-empty">${ic("layers")}<h2>첫 캠페인을 시작하세요</h2><p>리플레이 파일을 등록하면 날짜별 에피소드로 모입니다.<br>반복되는 이미지와 음악은 공용 자산으로 정리됩니다.</p><button class="button primary" id="empty-add">${ic("plus")}에피소드 등록</button><button class="button" id="empty-open">파일 바로 열기</button></div>`;
    $("#empty-add")?.addEventListener("click", add);
    $("#empty-open")?.addEventListener("click", openFile);
    paintIcons();
  }
  async function refresh() {
    const r = await fetch(new URL("index.json", base), { cache: "no-store" });
    if (!r.ok) throw Error("캠페인 목록을 불러오지 못했습니다.");
    catalog = validateCatalog(await r.json());
    render();
  }
  async function navigate() {
    const request = ++navSerial;
    loadingController?.abort();
    loadingController = null;
    const parts = location.hash.slice(1).split("/");
    if (parts[0] === "episode") {
      const c = catalog.campaigns.find((c) => c.id === parts[1]),
        e = c?.episodes.find((e) => e.id === parts[2]);
      if (!e) {
        show();
        status("해당 에피소드를 찾지 못했습니다.");
        return;
      }
      campaign = c!.id;
      const controller = new AbortController();
      loadingController = controller;
      pause();
      showReplay();
      setLoading(true);
      $("#episode-loading-title").textContent = e.title;
      $("#episode-loading-retry").hidden = true;
      const progress = document.querySelector<HTMLProgressElement>(
        "#episode-loading-progress",
      )!;
      progress.hidden = false;
      progress.removeAttribute("value");
      episodeStatus("에피소드 기록을 불러오는 중…");
      try {
        const record = await loadEpisode(
          base,
          e,
          (bytes) => {
            if (request !== navSerial) return;
            const total = e.assetBytes || 0;
            progress.value = total ? Math.min(1, bytes / total) : 0;
            episodeStatus(
              `이 에피소드의 자산 ${mb(bytes)}${total ? " / " + mb(total) : ""} 불러오는 중…`,
            );
          },
          controller.signal,
          { progressive: true },
        );
        if (request !== navSerial) {
          record.release();
          return;
        }
        await load(record);
        if (request !== navSerial) return;
        setLoading(false);
        $("#library-page").hidden = true;
        status("");
      } catch (error) {
        if (controller.signal.aborted || request !== navSerial) return;
        episodeStatus(errorMessage(error));
        progress.hidden = true;
        $("#episode-loading-retry").hidden = false;
      } finally {
        if (loadingController === controller) loadingController = null;
      }
      return;
    }
    campaign = parts[0] === "campaign" ? parts[1] : null;
    status("");
    show();
  }
  function add() {
    prepared = null;
    $("#episode-result").hidden = true;
    $("#episode-form").hidden = false;
    $("#episode-status").textContent = "";
    $("#episode-file").value = "";
    $("#episode-title").value = "";
    $("#campaign-title").value = "";
    $("#episode-date").value = new Date().toISOString().slice(0, 10);
    $("#episode-campaign").innerHTML =
      '<option value="">새 캠페인</option>' +
      catalog.campaigns
        .map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`)
        .join("");
    $("#episode-campaign").value = campaign || "";
    $("#campaign-title-wrap").hidden = !!$("#episode-campaign").value;
    $("#library-dialog").showModal();
  }
  $("#library-home").onclick = () => {
    location.hash = "library";
    show();
  };
  $("#library-local").onclick = openFile;
  $("#library-add").onclick = add;
  $("#library-recorder").onclick = () => {
    $("#library-page").hidden = true;
    showRecord();
  };
  $("#library-dialog-close").onclick = () => $("#library-dialog").close();
  $("#episode-campaign").onchange = (e) =>
    ($("#campaign-title-wrap").hidden = !!(e.target as HTMLInputElement).value);
  $("#library-list").onclick = (e) => {
    const c = (e.target as HTMLInputElement).closest<HTMLElement>(
        "[data-campaign]",
      ),
      ep = (e.target as HTMLInputElement).closest<HTMLElement>(
        "[data-episode]",
      );
    if (c) location.hash = "campaign/" + c.dataset.campaign;
    if (ep) location.hash = `episode/${campaign}/${ep.dataset.episode}`;
  };
  $("#episode-file").onchange = (e) => {
    if ((e.target as HTMLInputElement).files?.[0] && !$("#episode-title").value)
      $("#episode-title").value =
        (e.target as HTMLInputElement).files?.[0]?.name.replace(
          /\.(ccreplay|zip)$/i,
          "",
        ) || "";
  };
  $("#episode-form").onsubmit = async (e) => {
    e.preventDefault();
    if (pending) return;
    const file = $("#episode-file").files?.[0];
    if (!file) return;
    const button = $("#episode-prepare");
    button.disabled = true;
    $("#episode-status").textContent =
      "파일을 확인하고 공용 자산과 비교하는 중…";
    pending = true;
    let record;
    try {
      await refresh();
      record = await readArchive(file);
      prepared = await prepareEpisode(
        record,
        catalog,
        {
          campaignId: $("#episode-campaign").value,
          campaignTitle: $("#campaign-title").value,
          title: $("#episode-title").value,
          date: $("#episode-date").value,
        },
        (p) =>
          ($("#episode-status").textContent =
            `자산 확인 ${p.done} / ${p.total} · 추가 ${mb(p.newBytes)}`),
      );
      const blob = await patchBlob(prepared);
      $("#episode-form").hidden = true;
      $("#episode-result").hidden = false;
      $("#episode-result").innerHTML =
        `<div class="import-summary"><strong>${esc(prepared!.patch.episode.title)}</strong><p>공용 자산 재사용 ${mb(prepared.stats.reusedBytes)}<br>새 자산 ${mb(prepared.stats.newBytes)} · 회차 기록 ${mb(prepared.stats.manifestBytes)}</p></div><button class="button primary" id="download-patch">${ic("download")}등록 묶음 내려받기</button><p>다운로드한 ZIP을 프로젝트에서 적용한 뒤 변경된 파일을 커밋하세요. 기존 에피소드를 유지하면서 새 기록이 추가됩니다.</p><code class="import-command">npm run library:apply -- "등록묶음.zip"</code><p class="muted-note">현재 사이트에는 아직 게시되지 않았습니다.</p>`;
      $("#download-patch").onclick = () =>
        downloadBlob(
          blob,
          prepared!.patch.episode.title.replace(/[<>:"/\\|?*]/g, "_") +
            ".ccreplay-add.zip",
        );
      paintIcons();
    } catch (error) {
      $("#episode-status").textContent = errorMessage(error);
    } finally {
      record?.release();
      pending = null;
      button.disabled = false;
    }
  };
  window.addEventListener("hashchange", navigate);
  window.addEventListener("pagehide", () => loadingController?.abort(), {
    once: true,
  });
  refresh()
    .then(navigate)
    .catch((e) => {
      show();
      status(e.message);
    });
  show();
  function back() {
    navSerial++;
    loadingController?.abort();
    loadingController = null;
    location.hash = campaign ? "campaign/" + campaign : "library";
    show();
    status("");
  }
  return {
    show,
    back,
  };
}
