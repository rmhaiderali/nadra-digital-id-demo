import fs from "fs"
import { signal } from "@preact/signals"
import crackPin from "../crackPin.js"

const encryptedData = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/encryptedData.json", "utf-8"),
)

const pinTrying = signal("")

pinTrying.subscribe((value) => {
  if (value) console.log("Trying: " + value)
})

console.log(await crackPin(encryptedData, pinTrying))
