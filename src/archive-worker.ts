import { errorMessage } from "./core/errors.ts";
import { runCompression } from "./core/compression.ts";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ value: runCompression(data) });
  } catch (error) {
    self.postMessage({
      error: errorMessage(error) || "압축 처리에 실패했습니다.",
    });
  }
};
