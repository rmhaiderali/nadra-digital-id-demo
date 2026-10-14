import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader"
import { getImageDataOrBlobFromImageBitmapSource } from "../barcode-detector/utils"
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
const isValidImageBitmap = (imageBitmap) => imageBitmap instanceof ImageBitmap

self.onmessage = async (e) => {
  const images = Array.isArray(e.data) ? e.data : [e.data]

  try {
    const result = []

    for (let i = 0; i < images.length; i++) {
      const image = images[i]

      if (!isValidImageData(image) && !isValidImageBitmap(image)) continue

      const result =
        image instanceof ImageBitmap
          ? await getImageDataOrBlobFromImageBitmapSource(image)
          : image

      if (!result) {
        console.log("Failed to convert ImageBitmap to ImageData or Blob")
        continue
      }

      const barCodes = await readBarcodes(result, readerOptions)

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
