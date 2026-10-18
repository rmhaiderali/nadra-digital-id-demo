import nadraDigitalId from "nadra-digital-id"

export default function getHashFunctionByVersion(version) {
  const { sha256, sha384 } = nadraDigitalId.sha2

  const hashFunctionByVersion = {
    "1.0ce": { fn: sha256, name: "sha256", hexLength: sha256.hexLength },
    "1.1ce": { fn: sha256, name: "sha256", hexLength: sha256.hexLength },
    "1.2ce": { fn: sha384, name: "sha384", hexLength: sha384.hexLength },
    "1.3ce": { fn: sha384, name: "sha384", hexLength: sha384.hexLength },
  }

  const hashFunction = hashFunctionByVersion[version]

  if (!hashFunction) {
    return { error: "Unsupported data version: " + version }
  }

  return { data: hashFunction }
}
