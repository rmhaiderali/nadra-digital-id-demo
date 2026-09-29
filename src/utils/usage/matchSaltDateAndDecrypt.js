import fs from "fs"
import matchSaltDateAndDecrypt from "../matchSaltDateAndDecrypt.js"

const encryptedData = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/encryptedData.json", "utf-8"),
)

const credentials = JSON.parse(
  fs.readFileSync(import.meta.dirname + "/credentials.json", "utf-8"),
)

const pin = credentials.pin

const date = new Date(credentials.date)

console.log(await matchSaltDateAndDecrypt(encryptedData, pin, date))
