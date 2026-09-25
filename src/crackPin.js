import getHashFunctionByVersion from "./getHashFunctionByVersion.js"
import { chunkArray, range, passwordRangeToString } from "./utils.js"

export default async function crackPin(
  decodedData,
  crackingPinRange = {},
  crackingPinStatus = {},
) {
  if (!decodedData.hash) {
    return { error: "No hash found in the decoded data" }
  }

  const { data: hashFunction, error: hashFunctionError } =
    getHashFunctionByVersion(decodedData.v)

  if (hashFunctionError) {
    return { error: hashFunctionError }
  }

  if (decodedData.hash.length !== hashFunction.hexLength) {
    return { error: "Not valid " + hashFunction.name + " hash" }
  }

  crackingPinStatus.value = "cracking"

  let error = false
  let crackedPin = null

  main: for (const chunk of chunkArray(range(0, 999999), 100)) {
    crackingPinRange.value = passwordRangeToString(chunk)

    // wait a tick to update the UI with the new range being tried
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (crackingPinStatus.value !== "cracking") return { aborted: true }

    for (const i of chunk) {
      const pinsToCrack = []

      if (i < 10000) pinsToCrack.push(i.toString().padStart(4, "0"))

      if (i < 100000) pinsToCrack.push(i.toString().padStart(5, "0"))

      pinsToCrack.push(i.toString().padStart(6, "0"))

      for (const pinToCrack of pinsToCrack) {
        const { data: possiblePinHash, error: possiblePinHashError } =
          hashFunction.fn(pinToCrack)

        if (possiblePinHashError) {
          error = "Error hashing PIN:" + possiblePinHashError
          break main
        }

        if (decodedData.hash === possiblePinHash) {
          crackedPin = pinToCrack
          break main
        }
      }
    }
  }

  crackingPinRange.value = ""

  if (error) return { error }

  if (crackedPin) return { data: crackedPin }

  return { notfound: true }
}
