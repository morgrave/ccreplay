import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import {
  validateConfig,
  configuredOptions,
  chooseRoom,
  readConfig,
} from "../recorder/config.ts";
import { parseOptions } from "../recorder/options.ts";

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

test("record without arguments opens selection; IDs/numbers select rooms and conflicting modes reject", () => {
  assert.equal(parseOptions([]).url, undefined);
  const config = validateConfig(fixture());
  assert.equal(chooseRoom(config, "1")?.id, "feria");
  assert.equal(chooseRoom(config, " second ")?.id, "second");
  assert.equal(chooseRoom(config, "99"), undefined);
  for (const args of [
    ["--room", "feria", "https://ccfolia.com/rooms/x"],
    ["--list", "--room", "feria"],
    ["--recover", "saved.session", "--room", "feria"],
  ])
    assert.throws(() => parseOptions(args));
});

test("CLI overrides room settings, room overrides defaults, and output stays relative to the config", () => {
  const config = validateConfig(fixture());
  const cli = parseOptions([
    "--config",
    "settings/record.json",
    "--room",
    "feria",
  ]);
  const now = new Date("2026-10-08T01:02:03Z");
  const selected = configuredOptions(cli, config, config.rooms[0], now);
  assert.equal(selected.duration, 86400);
  assert.equal(selected.padding, 10000);
  assert.equal(selected.title, "엔딩 이후");
  assert.equal(selected.trim, true);
  assert.equal(
    selected.out,
    resolve(
      dirname(cli.config),
      "saved/페리아의 문장-2026-10-08T01-02-03-000Z.ccreplay",
    ),
  );
  const overridden = configuredOptions(
    parseOptions([
      "--room",
      "feria",
      "--duration",
      "12",
      "--padding",
      "0",
      "--no-trim",
      "--title",
      "다음 화",
      "--out",
      "recordings/custom.ccreplay",
    ]),
    config,
    config.rooms[0],
    now,
  );
  assert.equal(overridden.duration, 12);
  assert.equal(overridden.padding, 0);
  assert.equal(overridden.trim, false);
  assert.equal(overridden.title, "다음 화");
  assert.equal(overridden.out, resolve("recordings/custom.ccreplay"));
  assert.equal(
    configuredOptions(cli, config, config.rooms[1], now).padding,
    5000,
  );
});

test("config rejects malformed settings and supports Windows BOM JSON", async (t) => {
  for (const value of [
    null,
    {},
    { ...fixture(), version: 2 },
    { ...fixture(), rooms: [] },
    { ...fixture(), defaults: { duration: 0 } },
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
