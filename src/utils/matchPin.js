import getHashFunctionByVersion from "./getHashFunctionByVersion.js"

export default async function matchPin(encryptedData, pinToTest) {
  if (!encryptedData.hash) {
    return { error: "No hash found in the decoded data" }
  }

  const { data: hashFunction, error: hashFunctionError } =
    getHashFunctionByVersion(encryptedData.v)

  if (hashFunctionError) {
    return { error: hashFunctionError }
  }

  if (encryptedData.hash.length !== hashFunction.hexLength) {
    return { error: "Not valid " + hashFunction.name + " hash" }
  }

  const possiblePinHash = hashFunction.fn(pinToTest).toHex()

  if (encryptedData.hash === possiblePinHash) {
    return { match: true }
  }

  return { match: false }
}
