import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader"
import zxingReaderWasmUrl from "/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm?url"

const filePaths = { "zxing_reader.wasm": zxingReaderWasmUrl }

prepareZXingModule({
  overrides: { locateFile: (path) => filePaths[path] },
})

const readerOptions = {
  textMode: "Plain",
  formats: ["qr_code", "pdf417"],
}

const isValidImageData = (imageData) => imageData instanceof ImageData

self.onmessage = async (event) => {
  const data = event.data
  const imageDatas = Array.isArray(data) ? data : [data]

  try {
    const result = []

    for (let i = 0; i < imageDatas.length; i++) {
      const imageData = imageDatas[i]

      if (!isValidImageData(imageData)) continue

      const barCodes = await readBarcodes(imageData, readerOptions)

      for (const barCode of barCodes) {
        barCode.imageIndex = i
        result.push(barCode)
      }
    }

    if (result.length > 0) self.postMessage(result)
  } catch (e) {
    console.log(e)
  }
}
