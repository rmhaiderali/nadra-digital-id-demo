import { BarcodeDetector } from "barcode-detector"

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
