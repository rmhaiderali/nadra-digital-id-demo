import fs from "fs"
import matchPin from "../matchPin.js"

const encryptedData = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/encryptedData.json", "utf-8"),
)

const credentials = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/credentials.json", "utf-8"),
)

const pin = credentials.pin

console.log(await matchPin(encryptedData, pin))
