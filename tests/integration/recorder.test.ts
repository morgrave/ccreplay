import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { captureData } from "../../src/core/capture.ts";
import { trimIdleEdges } from "../../src/core/trim.ts";
import type { ExternalRecord } from "../../src/core/types.ts";

test("headless capture observes initial chat, token changes, new chat and BGM without an extension", async () => {
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    const page = await browser.newPage();
    // Exercise the real capture hook without changing a live room.
    await page.route("https://ccfolia.com/rooms/test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body><div id="root"><div data-field-object="token">initial scene</div></div></body></html>',
      }),
    );
    const wav = Buffer.alloc(44 + 8000 * 2);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    await page.route("https://ccfolia.com/test.wav", (route) =>
      route.fulfill({ contentType: "audio/wav", body: wav }),
    );
    const records: ExternalRecord[] = [];
    await page.exposeFunction(
      "__ccReplayWrite",
      async (batch: ExternalRecord[]) => {
        records.push(...batch);
      },
    );
    await page.goto("https://ccfolia.com/rooms/test");
    const fixture = await build({
      entryPoints: ["tests/fixtures/browser-room.ts"],
      bundle: true,
      format: "iife",
      minify: true,
      write: false,
    });
    await page.evaluate(fixture.outputFiles[0].text);
    const bundle = await build({
      entryPoints: ["recorder/browser.ts"],
      bundle: true,
      format: "iife",
      minify: true,
      write: false,
    });
    await page.evaluate(bundle.outputFiles[0].text);
    assert.equal(
      await page.evaluate(() => window.__ccReplayAuto.ready()),
      true,
    );
    await page.evaluate(() => window.__ccReplayAuto.start());
    await page.waitForTimeout(100);
    await page.evaluate(() =>
      (window as unknown as ExternalRecord).__updateFixture(),
    );
    await page.evaluate(() =>
      (window as unknown as ExternalRecord).__startFixtureAudio(),
    );
    await page.waitForTimeout(150);
    await page.evaluate(() =>
      (window as unknown as ExternalRecord).__fixtureAudio.pause(),
    );
    await page.evaluate(() => window.__ccReplayAuto.stop());
    const data = captureData(records, { startedAt: Date.now() });
    assert.equal(data.messages.find((m) => m.id === "initial")!.t, 0);
    assert.ok(data.messages.find((m) => m.id === "new")!.t > 0);
    assert.equal(data.frames[0].tokens[0].x, 0);
    assert.equal(data.frames.at(-1)!.tokens[0].x, 100);
    assert.ok(data.events.some((e) => e.type === 2));
    assert.ok(data.events.some((e) => e.type === 3));
    assert.ok(data.audio.some((a) => a.paused === false));
    assert.equal(data.audio.at(-1)!.paused, true);
    assert.ok(trimIdleEdges(data, 0).trim!.activityCount >= 3);
    assert.ok(
      records.some((r) => r.kind === "asset" && r.url.endsWith("test.wav")),
    );
  } finally {
    await browser.close();
  }
});
