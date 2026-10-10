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
        contents: `import {RoomChat} from './src/replay/chat.ts'; window.chat=new RoomChat([{id:'sys',t:0,name:'',text:'system',channel:'main'},{id:'user',t:0,name:'character',text:'hello',channel:'main',iconUrl:'portrait'},{id:'user2',t:1000,name:'next',text:'later',channel:'main',iconUrl:'other'}],url=>'https://example.com/'+url);window.chat.sync(document,0);`,
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
    await page.evaluate(() => (window as any).chat.sync(document, 1000));
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
  } finally {
    await browser.close();
  }
});
