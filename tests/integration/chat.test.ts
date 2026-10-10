import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
test("a system message first does not remove portraits from subsequent replay chat rows", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<div class="MuiDrawer-paper"><div role="log"><div class="MuiListItem-root"><div class="MuiListItemAvatar-root"><div></div></div><h6>system</h6><p class="MuiListItemText-secondary">update</p></div><div class="MuiListItem-root"><div class="MuiListItemAvatar-root"><div class="recorded-portrait"><div class="MuiAvatar-root MuiAvatar-square recorded-avatar MuiAvatar-colorDefault"><svg></svg></div></div></div><h6>character</h6><p class="MuiListItemText-secondary">chat</p></div></div></div>`,
    );
    const bundle = await build({
      stdin: {
        contents: `import {RoomChat} from './src/replay/chat.ts'; window.chat=new RoomChat([{id:'sys',t:0,name:'',text:'system',channel:'main'},{id:'user',t:0,name:'character',text:'hello',channel:'main',iconUrl:'portrait'},{id:'user2',t:1000,name:'next',text:'later',channel:'main',iconUrl:'other'},{id:'user',t:2000,name:'character',text:'edited',channel:'main',iconUrl:'portrait'},{id:'sys',t:3000,name:'',text:'',channel:'main',removed:true}],url=>'https://example.com/'+url);window.chat.sync(document,0);`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "iife",
      write: false,
    });
    await page.evaluate(bundle.outputFiles[0].text);
    assert.equal(
      await page.locator("[data-replay-chat] .MuiAvatar-img").count(),
      1,
    );
    assert.equal(
      await page
        .locator("[data-replay-chat] .MuiAvatar-img")
        .getAttribute("src"),
      "https://example.com/portrait",
    );
    assert.equal(
      await page.locator("[data-replay-chat] .recorded-avatar").count(),
      1,
    );
    assert.equal(
      await page.locator("[data-replay-chat] .MuiAvatar-colorDefault").count(),
      0,
    );
    await page.evaluate(() => {
      (window as any).firstPortrait = document.querySelector(
        "[data-replay-chat] .MuiAvatar-img",
      );
      (window as any).chat.sync(document, 1000);
    });
    assert(
      await page.evaluate(
        () =>
          document.querySelector("[data-replay-chat] .MuiAvatar-img") ===
          (window as any).firstPortrait,
      ),
      "appending chat must preserve existing rows and portrait nodes",
    );
    assert.equal(
      await page.locator("[data-replay-chat] .MuiAvatar-img").count(),
      2,
    );
    assert.equal(
      await page
        .locator("[data-replay-chat] .MuiAvatar-img")
        .last()
        .getAttribute("src"),
      "https://example.com/other",
    );
    await page.evaluate(() => (window as any).chat.sync(document, 3000));
    assert.equal(await page.locator("[data-replay-chat] > li").count(), 2);
    assert.equal(
      await page
        .locator("[data-replay-chat] .MuiListItemText-secondary")
        .first()
        .textContent(),
      "edited",
    );
    await page.evaluate(() => (window as any).chat.sync(document, 0));
    assert.equal(
      await page
        .locator("[data-replay-chat] .MuiListItemText-secondary")
        .last()
        .textContent(),
      "hello",
    );
    assert(
      await page.evaluate(
        () =>
          document.querySelector("[data-replay-chat] .MuiAvatar-img") ===
          (window as any).firstPortrait,
      ),
      "backward seeks reuse the original revision without losing portraits",
    );
  } finally {
    await browser.close();
  }
});

test("checkpoint rebuilds restore cached chat, selected tabs, collapse state and scroll", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<iframe id="room"></iframe>');
    const drawer = `<div class="MuiDrawer-paper" style="flex-direction:column">
      <button aria-label="チャットウィンドウをとじる">close</button>
      <div role="tablist"><button>메인</button><button>정보</button></div>
      <div role="log" style="height:90px;overflow:auto">
        <div class="MuiListItem-root"><div class="MuiListItemAvatar-root"><div class="MuiAvatar-root"></div></div>
          <h6>character</h6><p class="MuiListItemText-secondary">chat</p></div>
      </div></div>`;
    const html = `<!doctype html><html><head><style>h6,p{margin:0}.MuiListItem-root{height:30px}.MuiAvatar-root{width:10px;height:10px}</style></head><body><button aria-label="チャットウィンドウを開く">open</button>${drawer}</body></html>`;
    const bundle = await build({
      stdin: {
        contents: `import {RoomChat} from './src/replay/chat.ts';
          const doc=document.querySelector('iframe').contentDocument;
          doc.open();doc.write(${JSON.stringify(html)});doc.close();
          const messages=[...Array.from({length:20},(_,i)=>({id:'main'+i,t:0,name:'character',text:'main '+i,channel:'main',iconUrl:'portrait'})),
            {id:'info',t:0,name:'character',text:'information',channel:'info'},
            {id:'later',t:1000,name:'character',text:'future message',channel:'main'}];
          window.chat=new RoomChat(messages,()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
          const sync=window.chat.sync.bind(window.chat);
          window.syncCalls=0;
          window.chat.sync=(...args)=>{window.syncCalls++;sync(...args)};
          window.chat.sync(doc,1000);
          window.portrait=doc.querySelector('[data-replay-chat] .MuiAvatar-img');`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "iife",
      write: false,
    });
    await page.evaluate(bundle.outputFiles[0].text);
    const room = page.frameLocator("#room");
    for (const mode of ["checkpoint", "drawer"] as const) {
      await page.evaluate(() => {
        const doc = document.querySelector("iframe")!.contentDocument!;
        (window as any).chat.sync(doc, 1000);
        const live = doc.querySelector<HTMLElement>("[data-replay-chat]")!;
        live.scrollTop = 42;
        live.dispatchEvent(new Event("scroll"));
      });
      await room.getByRole("tab", { name: "정보", exact: true }).click();
      await room
        .getByRole("button", { name: "チャットウィンドウをとじる" })
        .click();
      await page.evaluate(
        ({ mode, html, drawer }) => {
          const doc = document.querySelector("iframe")!.contentDocument!;
          if (mode === "checkpoint") {
            // rrweb reuses the Document and clears its listeners with open().
            doc.close();
            doc.open();
            doc.write(html);
            doc.close();
          } else {
            doc.querySelector(".MuiDrawer-paper")!.outerHTML = drawer;
          }
          (window as any).chat.sync(doc, 0);
          (window as any).syncCalls = 0;
        },
        { mode, html, drawer },
      );
      assert.equal(
        await room
          .locator(".MuiDrawer-paper")
          .evaluate((element) => getComputedStyle(element).display),
        "none",
      );
      assert.equal(
        await room
          .locator("[data-replay-chat]")
          .getAttribute("data-replay-channel"),
        "info",
      );
      assert.equal(
        await room
          .locator("[data-replay-chat] .MuiListItemText-secondary")
          .textContent(),
        "information",
      );
      await room
        .getByRole("button", { name: "チャットウィンドウを開く" })
        .click();
      assert.equal(await page.evaluate(() => (window as any).syncCalls), 1);
      await room.getByRole("tab", { name: "메인", exact: true }).click();
      assert.equal(await page.evaluate(() => (window as any).syncCalls), 2);
      assert.equal(await room.locator("[data-replay-chat] > li").count(), 20);
      assert.equal(
        await room
          .locator("[data-replay-chat]")
          .evaluate((element) => element.scrollTop),
        42,
      );
      assert(
        await page.evaluate(
          () =>
            document
              .querySelector("iframe")!
              .contentDocument!.querySelector(
                "[data-replay-chat] .MuiAvatar-img",
              ) === (window as any).portrait,
        ),
        `${mode} rebuild should reattach the cached portrait to the new log`,
      );
    }
  } finally {
    await browser.close();
  }
});

test("large chat histories remain fully scrollable with variable row heights", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>
      h6,p{margin:0}.MuiListItem-root{display:flex;padding:8px;align-items:flex-start}
      .MuiListItemText-secondary{white-space:pre-wrap;overflow-wrap:anywhere}
      .MuiAvatar-root{width:24px;height:24px;flex:none}
      </style><div class="MuiDrawer-paper"><div role="log" style="height:300px;width:360px;overflow:auto">
      <div class="MuiListItem-root"><div class="MuiListItemAvatar-root"><div class="MuiAvatar-root"></div></div>
      <div><h6>character</h6><p class="MuiListItemText-secondary">chat</p></div></div></div></div>`);
    const bundle = await build({
      stdin: {
        contents: `import {RoomChat} from './src/replay/chat.ts';
          const messages=Array.from({length:400},(_,i)=>({id:'message'+i,t:0,name:'Character '+i,
            text:i%7===0?'long dialogue '.repeat(70):'message '+i,channel:'main',iconUrl:'portrait'}));
          const chat=new RoomChat(messages,()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
          chat.sync(document,0);`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "iife",
      write: false,
    });
    await page.evaluate(bundle.outputFiles[0].text);
    const log = page.locator("[data-replay-chat]");
    assert.equal(await log.locator(":scope > li").count(), 400);
    assert.equal(await log.locator(".MuiAvatar-img").count(), 400);
    for (const index of [0, 399, 196, 0]) {
      const row = log.locator(":scope > li").nth(index);
      await row.locator("h6").scrollIntoViewIfNeeded();
      assert.equal(await row.locator("h6").textContent(), `Character ${index}`);
      const bounds = await row.locator(".MuiAvatar-img").boundingBox();
      assert(bounds);
      assert.equal(bounds.width, 24);
      assert.equal(bounds.height, 24);
      const viewport = await log.boundingBox();
      assert(viewport);
      assert(bounds.y >= viewport.y && bounds.y < viewport.y + viewport.height);
    }
    await log.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const last = await log.locator(":scope > li").last().boundingBox();
    const viewport = await log.boundingBox();
    assert(last && viewport);
    assert(
      last.y < viewport.y + viewport.height,
      "the final message remains reachable at the end of the scrollbar",
    );
  } finally {
    await browser.close();
  }
});
