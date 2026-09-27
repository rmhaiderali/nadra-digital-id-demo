import getHashFunctionByVersion from "./getHashFunctionByVersion.js"

export default async function matchPin(decodedData, pinToTest) {
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

  const { data: possiblePinHash, error: possiblePinHashError } =
    hashFunction.fn(pinToTest)

  if (possiblePinHashError) {
    return { error: "Error hashing PIN:" + possiblePinHashError }
  }

  if (decodedData.hash === possiblePinHash) {
    return { match: true }
  }

  return { match: false }
}
