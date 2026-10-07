import {
  zipSync,
  unzipSync,
  type Zippable,
  type Unzipped,
  type ZipOptions,
} from "fflate";

type Request =
  | {
      operation: "zip";
      input: Zippable;
      level?: ZipOptions["level"];
      recordingOnly?: boolean;
    }
  | {
      operation: "unzip";
      input: Uint8Array<ArrayBuffer>;
      level?: ZipOptions["level"];
      recordingOnly?: boolean;
    };
type Result<R extends Request> = R extends { operation: "zip" }
  ? Uint8Array<ArrayBuffer>
  : Unzipped;
export function runCompression(
  request: Extract<Request, { operation: "zip" }>,
): Uint8Array<ArrayBuffer>;
export function runCompression(
  request: Extract<Request, { operation: "unzip" }>,
): Unzipped;
export function runCompression(
  request: Request,
): Uint8Array<ArrayBuffer> | Unzipped;
export function runCompression({
  operation,
  input,
  level = 6,
  recordingOnly = false,
}: Request) {
  if (operation === "zip") return zipSync(input, { level });
  if (operation !== "unzip") throw Error("지원하지 않는 압축 작업입니다.");
  let total = 0;
  return unzipSync(input, {
    filter: (file) => {
      total += file.originalSize;
      if (total > 1024 * 1024 * 1024)
        throw Error("압축을 푼 기록 크기가 1 GB를 넘습니다.");
      return (
        !recordingOnly || /^(recording\.json|assets\/[^/]+)$/.test(file.name)
      );
    },
  });
}

// A same-origin bundled worker works under script-src 'self' without blob workers.
export function compress<R extends Request>(request: R): Promise<Result<R>> {
  if (typeof window === "undefined")
    return Promise.resolve().then(() => runCompression(request) as Result<R>);
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined, timer: ReturnType<typeof setTimeout>;
    const finish = (error: Error | null, value?: Result<R>) => {
      clearTimeout(timer);
      worker?.terminate();
      error ? reject(error) : resolve(value!);
    };
    try {
      worker = new Worker(new URL("./archive-worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) =>
        finish(data.error ? new Error(data.error) : null, data.value);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(
          new Error(
            "압축 처리기를 실행하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
          ),
        );
      };
      worker.onmessageerror = () =>
        finish(new Error("압축 처리 결과를 읽지 못했습니다."));
      timer = setTimeout(
        () =>
          finish(
            new Error(
              "압축 처리 시간이 초과되었습니다. 파일 크기를 줄이거나 다시 시도하세요.",
            ),
          ),
        120000,
      );
      worker.postMessage(request);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
