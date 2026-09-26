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

  for (const chunk of chunkArray(range(0, 999999), 100)) {
    // wait a tick to update the UI with the new range being tried
    await new Promise((resolve) => setTimeout(resolve, 0))

    if (crackingPinStatus.value !== "cracking") return { aborted: true }

    crackingPinRange.value = passwordRangeToString(chunk)

    for (const i of chunk) {
      const pinsToTest = []

      if (i < 10000) pinsToTest.push(i.toString().padStart(4, "0"))

      if (i < 100000) pinsToTest.push(i.toString().padStart(5, "0"))

      pinsToTest.push(i.toString().padStart(6, "0"))

      for (const pinToTest of pinsToTest) {
        const { data: possiblePinHash, error: possiblePinHashError } =
          hashFunction.fn(pinToTest)

        if (possiblePinHashError) {
          return { error: "Error hashing PIN:" + possiblePinHashError }
        }

        if (decodedData.hash === possiblePinHash) {
          return { data: pinToTest }
        }
      }
    }
  }

  return { notfound: true }
}
