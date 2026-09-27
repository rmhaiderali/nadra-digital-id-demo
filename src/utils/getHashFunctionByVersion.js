import nadraDigitalId from "nadra-digital-id"

export default function getHashFunctionByVersion(version) {
  const hashFunctionByVersion = {
    "1.0ce": { fn: nadraDigitalId.sha256, name: "sha256", hexLength: 64 },
    "1.2ce": { fn: nadraDigitalId.sha384, name: "sha384", hexLength: 96 },
  }

  const hashFunction = hashFunctionByVersion[version]

  if (!hashFunction) {
    return { error: "Unsupported data version: " + version }
  }

  return { data: hashFunction }
}
