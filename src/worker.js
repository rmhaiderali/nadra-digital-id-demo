import { BarcodeDetector, prepareZXingModule } from "barcode-detector"
import zxingReaderWasmUrl from "/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm?url"

const filePaths = { "zxing_reader.wasm": zxingReaderWasmUrl }

prepareZXingModule({
  overrides: { locateFile: (path, prefix) => filePaths[path] ?? path + prefix },
})

const detector = new BarcodeDetector({ formats: ["qr_code"] })

self.onmessage = async (event) => {
  const bitmap = event.data

  try {
    const codes = await detector.detect(bitmap)
    if (codes.length > 0) self.postMessage(codes)
  } catch (e) {
    console.log(e)
  }

  bitmap.close()
}
