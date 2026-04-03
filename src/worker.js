import { BarcodeDetector, prepareZXingModule } from "barcode-detector"
import zxingReaderWasmUrl from "/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm?url"

const filePaths = { "zxing_reader.wasm": zxingReaderWasmUrl }

prepareZXingModule({
  overrides: { locateFile: (path, prefix) => filePaths[path] ?? path + prefix },
})

const detector = new BarcodeDetector({ formats: ["qr_code"] })

const isValidBitmap = (bitmap) => bitmap instanceof ImageBitmap

self.onmessage = async (event) => {
  const data = event.data
  const bitmaps = Array.isArray(data) ? data : [data]

  try {
    const result = []
    for (let i = 0; i < bitmaps.length; i++) {
      const bitmap = bitmaps[i]
      if (!isValidBitmap(bitmap)) continue
      const barCodes = await detector.detect(bitmap)
      for (const barCode of barCodes) {
        barCode.imageIndex = i
        result.push(barCode)
      }
      bitmap.close()
    }
    if (result.length > 0) self.postMessage(result)
  } catch (e) {
    console.log(e)
  }
}
