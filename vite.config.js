import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"

const dropUnwantedWasm = () => ({
  name: "drop-unwanted-wasm",
  enforce: "pre",
  transform(code, id) {
    if (id.includes("@rmhaiderali/zint-wasm/src/zint.js"))
      return code.replaceAll("zint.wasm", "")
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dropUnwantedWasm(),
    babel({ plugins: [["module:@preact/signals-react-transform"]] }),
  ],
  base: "/nadra-digital-id-demo",
})
