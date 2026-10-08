import test from "node:test";
import assert from "node:assert/strict";
import { _electron } from "playwright";
import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import type { ExternalRecord } from "../../src/core/types.ts";
import type { DesktopState } from "../../desktop/types.ts";

test(
  "desktop buttons record a room, reject duplicate starts, and save before closing",
  { timeout: 90000 },
  async (t) => {
    const executablePath = process.env.CCREPLAY_TEST_EXECUTABLE;
    const application = await _electron.launch(
      executablePath ? { executablePath } : { args: ["."] },
    );
    try {
      const page = await application.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>("#start")?.disabled,
      );
      const initialState = await page.evaluate(() => window.recorder.state());
      const expectedPaths = await application.evaluate(({ app }) => {
        const path = process.getBuiltinModule("path");
        return {
          config: path.join(
            app.isPackaged ? process.resourcesPath : app.getAppPath(),
            "record.config.json",
          ),
          output: path.join(
            app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
            "recordings",
          ),
        };
      });
      assert.equal(initialState.configPath, expectedPaths.config);
      assert.equal(initialState.outputDir, expectedPaths.output);
      const originalConfig = await readFile(initialState.configPath);
      t.after(() => writeFile(initialState.configPath, originalConfig));
      const updatedConfig = JSON.parse(
        originalConfig.toString("utf8").replace(/^\uFEFF/, ""),
      );
      updatedConfig.defaults.duration = 0;
      updatedConfig.rooms.push({
        id: "added-room",
        name: "Added room",
        url: "https://ccfolia.com/rooms/test",
      });
      await writeFile(initialState.configPath, JSON.stringify(updatedConfig));
      await page.click("#reload");
      await page.waitForFunction(() =>
        Array.from(
          document.querySelector<HTMLSelectElement>("#room")!.options,
        ).some((option) => option.value === "added-room"),
      );
      assert.equal(await page.locator("#duration").inputValue(), "0");
      await writeFile(initialState.configPath, originalConfig);
      await page.click("#reload");
      const preferences = join(
        dirname(initialState.configPath),
        "preferences.json",
      );
      const backup = await readFile(preferences).catch(() => undefined);
      t.after(async () => {
        if (backup) await writeFile(preferences, backup);
        else await rm(preferences, { force: true });
      });
      const folder = resolve("work/desktop-integration");
      await mkdir(folder, { recursive: true });
      const fixture = await build({
        entryPoints: ["tests/fixtures/browser-room.ts"],
        bundle: true,
        format: "iife",
        write: false,
      });
      await application.evaluate(
        ({ app, dialog }, { folder, script }) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [folder],
          });
          const req = process
            .getBuiltinModule("module")
            .createRequire(app.getAppPath() + "/package.json");
          const chromium = req("playwright").chromium as ExternalRecord;
          const originalLaunch = chromium.launch.bind(chromium);
          chromium.launch = async (options: unknown) => {
            const browser = await originalLaunch(options);
            const originalContext = browser.newContext.bind(browser);
            browser.newContext = async (options: unknown) => {
              const context = await originalContext(options);
              const originalPage = context.newPage.bind(context);
              context.newPage = async () => {
                const room = await originalPage();
                await room.route(
                  "https://ccfolia.com/rooms/test",
                  (route: ExternalRecord) =>
                    route.fulfill({
                      contentType: "text/html",
                      body: `<html><body><div id="root"><div data-field-object="token">initial scene</div></div><script>${script}</script></body></html>`,
                    }),
                );
                const goto = room.goto.bind(room);
                room.goto = (_url: string, options: unknown) =>
                  goto("https://ccfolia.com/rooms/test", options);
                return room;
              };
              return context;
            };
            return browser;
          };
        },
        { folder, script: fixture.outputFiles[0].text },
      );
      await page.click("#folder");
      await page.fill("#duration", "0");
      await page.fill("#title", "Desktop integration");
      // Only configured rooms can be started, regardless of renderer input.
      await assert.rejects(
        page.evaluate(() =>
          window.recorder.start({
            roomId: "missing",
            title: "test",
            duration: 30,
            padding: 0,
            trim: true,
          }),
        ),
      );
      await page.click("#start");
      await page.waitForFunction(
        () => document.querySelector("#status")?.textContent === "● 기록 중",
        undefined,
        { timeout: 30000 },
      );
      await page.waitForFunction(
        () => Number(document.querySelector("#messages")?.textContent) > 0,
      );
      assert.equal(await page.locator("#start").isDisabled(), true);
      await page.waitForTimeout(1200);
      assert.equal(
        (await page.evaluate(() => window.recorder.state())).active,
        true,
      );
      assert.ok(
        (await page.evaluate(() => window.recorder.state())).logs.some((log) =>
          log.text.includes("시간 제한 없음"),
        ),
      );
      await assert.rejects(
        page.evaluate(() =>
          window.recorder.start({
            roomId: "feria",
            title: "test",
            duration: 30,
            padding: 0,
            trim: true,
          }),
        ),
      );
      await page.click("#stop");
      await page.waitForFunction(
        () => document.querySelector("#status")?.textContent === "저장 완료",
      );
      const state: DesktopState = await page.evaluate(() =>
        window.recorder.state(),
      );
      assert.ok(state.output);
      const data = JSON.parse(
        strFromU8(unzipSync(await readFile(state.output))["recording.json"]),
      );
      assert.equal(data.messages[0].text, "existing chat");
      assert.ok(data.frames.length);
      assert.ok(state.logs.some((log) => log.text.includes("채팅")));
      assert.deepEqual(errors, []);
      // Closing the window during the next recording must finish the archive first.
      await page.click("#start");
      await page.waitForFunction(
        () => document.querySelector("#status")?.textContent === "● 기록 중",
      );
      await page.waitForFunction(
        () => Number(document.querySelector("#messages")?.textContent) > 0,
      );
      const previousFiles = new Set(await readdir(folder));
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await page.waitForEvent("close", { timeout: 30000 });
      const savedOnClose = (await readdir(folder)).find(
        (file) => file.endsWith(".ccreplay") && !previousFiles.has(file),
      );
      assert.ok(
        savedOnClose,
        "closing must create a valid replay before destroying the window",
      );
      const finalData = JSON.parse(
        strFromU8(
          unzipSync(await readFile(join(folder, savedOnClose)))[
            "recording.json"
          ],
        ),
      );
      assert.equal(finalData.messages[0].text, "existing chat");
    } finally {
      await application.close().catch(() => {});
    }
  },
);
