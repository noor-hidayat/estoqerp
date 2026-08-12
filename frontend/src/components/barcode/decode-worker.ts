import {
  prepareZXingModule,
  readBarcodes,
  type ReadInputBarcodeFormat,
} from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

const FORMATS: ReadInputBarcodeFormat[] = ["Code128", "EAN13", "EAN8"];

prepareZXingModule({
  overrides: { locateFile: () => wasmUrl },
  fireImmediately: true,
});

interface DecodeRequest {
  id: number;
  imageData: ImageData;
}

interface DecodeResponse {
  id: number;
  text: string;
}

const ctx = self as unknown as {
  postMessage(message: DecodeResponse): void;
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
};

ctx.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, imageData } = e.data;
  try {
    const results = await readBarcodes(imageData, { formats: FORMATS });
    const text =
      results.length > 0 && results[0].text ? results[0].text.trim() : "";
    ctx.postMessage({ id, text });
  } catch {
    ctx.postMessage({ id, text: "" });
  }
};
