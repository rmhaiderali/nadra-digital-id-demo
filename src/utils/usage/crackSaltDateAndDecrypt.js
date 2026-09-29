import fs from "fs"
import { signal } from "@preact/signals"
import crackSaltDateAndDecrypt from "../crackSaltDateAndDecrypt.js"

const encryptedData = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/encryptedData.json", "utf-8"),
)

const credentials = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/credentials.json", "utf-8"),
)

const pin = credentials.pin

const dateStart = new Date(credentials.dateStart)
const dateEnd = new Date(credentials.dateEnd)

const dateTrying = signal("")

dateTrying.subscribe((value) => {
  if (value) console.log("Trying: " + value)
})

console.log(
  await crackSaltDateAndDecrypt(
    encryptedData,
    pin,
    dateStart,
    dateEnd,
    "yyyy/MM/dd",
    dateTrying,
  ),
)
