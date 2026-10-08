import test from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import {
  validateConfig,
  configuredOptions,
  readConfig,
} from "../recorder/config.ts";

const fixture = () => ({
  version: 1,
  defaults: { duration: 86400, trim: true, padding: 5, outputDir: "saved" },
  rooms: [
    {
      id: "feria",
      name: "페리아의 문장",
      url: "https://ccfolia.com/rooms/ewqvsiQk4",
      title: "엔딩 이후",
      padding: 10,
    },
    { id: "second", name: "다른 방", url: "https://ccfolia.com/rooms/abc" },
  ],
});

test("desktop room settings override defaults and filename stays in the chosen folder", () => {
  const config = validateConfig(fixture());
  const selected = configuredOptions(
    config,
    config.rooms[0],
    "saved",
    new Date("2026-10-08T01:02:03Z"),
  );
  assert.equal(selected.duration, 86400);
  assert.equal(selected.padding, 10000);
  assert.equal(selected.trim, true);
  assert.equal(
    selected.out,
    resolve(
      "saved",
      config.rooms[0].name + "-2026-10-08T01-02-03-000Z.ccreplay",
    ),
  );
  assert.equal(
    configuredOptions(config, config.rooms[1], "saved").padding,
    5000,
  );
});

test("config rejects malformed settings and supports Windows BOM JSON", async (t) => {
  for (const value of [
    null,
    {},
    { ...fixture(), version: 2 },
    { ...fixture(), rooms: [] },
    { ...fixture(), defaults: { duration: -1 } },
    { ...fixture(), defaults: { padding: "5" } },
    { ...fixture(), defaults: { trim: "false" } },
    { ...fixture(), rooms: [fixture().rooms[0], fixture().rooms[0]] },
    {
      ...fixture(),
      rooms: [{ ...fixture().rooms[0], url: "https://example.com" }],
    },
  ])
    assert.throws(() => validateConfig(value));
  const directory = await mkdtemp(join(tmpdir(), "ccreplay-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "record.json");
  await writeFile(path, "\uFEFF" + JSON.stringify(fixture()));
  assert.equal((await readConfig(path)).rooms.length, 2);
  await writeFile(path, "{invalid}");
  await assert.rejects(readConfig(path), /기록 설정을 읽지 못했습니다/);
});

test("zero duration survives config defaults and room overrides as unlimited", () => {
  const config = validateConfig({ ...fixture(), defaults: { duration: 0 } });
  assert.equal(configuredOptions(config, config.rooms[0], "saved").duration, 0);
  const roomConfig = validateConfig({
    ...fixture(),
    rooms: [{ ...fixture().rooms[0], duration: 0 }],
  });
  assert.equal(
    configuredOptions(roomConfig, roomConfig.rooms[0], "saved").duration,
    0,
  );
});
