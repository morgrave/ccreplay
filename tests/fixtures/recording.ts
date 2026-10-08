import type { RecordingData } from "../../src/core/types.ts";
export function fixtureRecording(): RecordingData {
  const tokens = [
    {
      id: "yuna",
      name: "윤아",
      memo: "조사원\n낡은 수첩을 들고 있다.\n“뭔가 놓친 게 있을 거야.”",
      x: -180,
      y: 15,
      z: 3,
      width: 2,
      height: 2,
      angle: 0,
      color: "#e7b96c",
      iconUrl: "",
      status: [
        { label: "HP", value: 12, max: 14 },
        { label: "SAN", value: 58, max: 65 },
      ],
    },
    {
      id: "ian",
      name: "이안",
      memo: "기자\n카메라의 필름은 세 장 남았다.",
      x: 45,
      y: 65,
      z: 3,
      width: 2,
      height: 2,
      angle: 0,
      color: "#81acae",
      iconUrl: "",
      status: [
        { label: "HP", value: 10, max: 12 },
        { label: "SAN", value: 42, max: 60 },
      ],
    },
    {
      id: "keeper",
      name: "문지기",
      memo: "기차역을 지키는 사람.\n발소리가 들려도 돌아보지 않는다.",
      x: 170,
      y: -115,
      z: 3,
      width: 2,
      height: 2,
      angle: 0,
      color: "#bd99c8",
      iconUrl: "",
      status: [],
    },
  ];
  const frames = [];
  for (let t = 0; t <= 90000; t += 3000) {
    const chars = structuredClone(tokens);
    chars[0].x += Math.min(t / 90000, 1) * 200;
    chars[0].y -= Math.sin(t / 18000) * 60;
    chars[1].x -= Math.min(t / 90000, 1) * 100;
    if (t >= 42000) chars[0].status[1].value = 56;
    frames.push({
      t,
      room: {
        name: "마지막 열차가 떠난 뒤",
        fieldWidth: 30,
        fieldHeight: 19,
        fieldObjectFit: "fill",
        displayGrid: true,
        gridSize: 1,
        backgroundColor: "#242a2d",
        backgroundUrl: "",
        foregroundUrl: "",
        sceneId: t < 45000 ? "platform" : "waiting-room",
      },
      tokens: chars,
      items: [
        {
          id: "note",
          x: -50,
          y: -150,
          z: 1,
          width: 4,
          height: 1.5,
          angle: 0,
          text: "역무실 · 출입 금지",
          imageUrl: "",
          kind: "marker",
        },
        {
          id: "platform",
          x: -270,
          y: 130,
          z: 1,
          width: 9,
          height: 1,
          angle: 0,
          text: "03  ·  LAST TRAIN",
          imageUrl: "",
          kind: "marker",
        },
      ],
      cellSize: 24,
      bgm: [
        {
          id: "bgm1",
          name: "테스트 음원 · 느린 신호",
          url: "demo:audio",
          volume: 0.6,
          loop: true,
        },
      ],
    });
  }
  const chats = [
    [
      0,
      "KEEPER",
      "자정이 지난 역에는 여러분의 발소리만 남아 있습니다.",
      "main",
    ],
    [6000, "윤아", "역무실 쪽을 살펴볼게요. 불이 켜져 있나요?", "main"],
    [12500, "KEEPER", "문 아래로 희미한 빛이 새어 나옵니다.", "main"],
    [21000, "이안", "먼저 표지판을 찍어둘게요.", "main"],
    [28000, "윤아", "CC<=70 관찰력 → 34 / 성공", "main"],
    [35000, "KEEPER", "시계는 11시 57분에서 멈춰 있습니다.", "info"],
    [42000, "윤아", "잠깐, 우리가 들어왔을 때도 이 시간이었나요?", "main"],
    [51000, "이안", "수첩에 시간을 적어뒀어요. 분명 자정이었는데.", "main"],
    [62000, "KEEPER", "그때 역무실 안에서 전화벨이 울립니다.", "main"],
    [74000, "윤아", "문을 열고 들어갑니다.", "main"],
    [84000, "KEEPER", "이 장면에서 잠깐 쉬어갈게요.", "other"],
  ].map(([t, name, text, channel], i) => ({
    id: "m" + i,
    t: Number(t),
    name: String(name),
    text: String(text),
    channel: String(channel),
    channelName:
      channel === "info" ? "정보" : channel === "other" ? "잡담" : "메인",
    color:
      name === "윤아" ? "#e7b96c" : name === "이안" ? "#81acae" : "#b9b6cb",
    iconUrl: "",
    imageUrl: "",
  }));
  return {
    format: "ccreplay",
    version: 1,
    title: "마지막 열차가 떠난 뒤",
    duration: 90000,
    startedAt: 1791309600000,
    frames,
    messages: chats,
    audio: [
      {
        t: 0,
        id: "demo-bgm",
        url: "demo:audio",
        position: 0,
        volume: 0.5,
        loop: true,
        paused: false,
        rate: 1,
      },
    ],
    events: [],
    assets: [],
    warnings: [],
    adapter: true,
  };
}
export function fixtureSound() {
  const rate = 16000;
  const length = rate * 6;
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const s = (o: number, v: string) =>
    [...v].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  s(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  s(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const envelope = Math.sin((Math.PI * t) / 6) ** 2;
    view.setInt16(
      44 + i * 2,
      Math.round(
        (Math.sin(2 * Math.PI * 130.81 * t) * 0.5 +
          Math.sin(2 * Math.PI * 196 * t) * 0.3 +
          Math.sin(2 * Math.PI * 261.62 * t) * 0.2) *
          envelope *
          4500,
      ),
      true,
    );
  }
  return new Blob([bytes], { type: "audio/wav" });
}
