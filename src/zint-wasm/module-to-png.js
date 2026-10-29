import { deflate } from "pako"
import { encode, ColorType } from "png-tools"

export default function moduleToPng(module, { scale = 1, margin = 4 } = {}) {
  const width = (module.width + margin * 2) * scale
  const height = (module.rows + margin * 2) * scale
  const data = new Uint8Array(width * height).fill(255)

  for (let my = 0; my < module.rows; my++) {
    for (let mx = 0; mx < module.width; mx++) {
      const dark = (module.data[my * module.width + (mx >> 3)] >> (mx & 7)) & 1
      if (!dark) continue

      const x0 = (mx + margin) * scale
      const y0 = (my + margin) * scale
      for (let dy = 0; dy < scale; dy++) {
        data.fill(0, (y0 + dy) * width + x0, (y0 + dy) * width + x0 + scale)
      }
    }
  }

  const options = { data, width, height, colorType: ColorType.GRAYSCALE }

  return encode(options, deflate)
}
