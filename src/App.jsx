import { DateTime } from "luxon"
import { toast } from "react-toastify"
import { signal } from "@preact/signals"
import { useState, useEffect } from "react"
import nadraDigitalId from "nadra-digital-id"
import { writeBarcode, prepareZXingModule } from "zxing-wasm/writer"
import zxingWriterWasmUrl from "/node_modules/zxing-wasm/dist/writer/zxing_writer.wasm?url"
import Scanner from "./Scanner.jsx"
import Loading from "./Loading.jsx"
import crackPin from "./utils/crackPin.js"
import matchSaltDate from "./utils/matchSaltDateAndDecrypt.js"
import crackSaltDate from "./utils/crackSaltDateAndDecrypt.js"

// nadraDigitalId.setDebug(true)

const filePaths = { "zxing_writer.wasm": zxingWriterWasmUrl }

prepareZXingModule({
  overrides: { locateFile: (path) => filePaths[path] },
})

const dateDelimiter =
  new Date().toLocaleDateString().match(/[\-|\/|\.|]/)?.[0] || "/"

const dateFormat = "yyyy" + dateDelimiter + "MM" + dateDelimiter + "dd"

const formatsUsedOnDocuments = {
  PDF417: ["CNIC"],
  QRCode: ["CNIC", "Digital ID"],
}

const genericFormatNames = {
  PDF417: "Barcode",
  QRCode: "QR Code",
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function downloadBarcode(data, filename, options) {
  const { error, image } = await writeBarcode(data, options)

  if (error) {
    toast.error("Failed to generate " + options.format)
    console.log(error)
    return
  }

  downloadBlob(image, filename)
}

function toCreatorOptionsString(options) {
  return Object.entries(options)
    .filter(([k, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => k + "=" + v)
    .join(",")
}

window.fullAccess = () => {
  localStorage.setItem("fullAccess", "true")
  toast.success("Granted Full Access")
  setTimeout(() => window.location.reload(), 2000)
}

window.revokeFullAccess = () => {
  localStorage.removeItem("fullAccess")
  toast.success("Revoked Full Access")
  setTimeout(() => window.location.reload(), 2000)
}

const fullAccess = localStorage.getItem("fullAccess") === "true"

const crackedPin = signal("")
const crackingPinRange = signal("")
const crackingPinStatus = signal("not started")

const crackedSaltDate = signal("")
const crackingSaltDateRange = signal("")
const crackingSaltDateStatus = signal("not started")

export default function App() {
  const [is12HourCycle, _setIs12HourCycle] = useState(() =>
    JSON.parse(localStorage.getItem("is12HourCycle") ?? "true"),
  )

  function setIs12HourCycle(value) {
    _setIs12HourCycle(value)
    localStorage.setItem("is12HourCycle", value)
  }

  // 0: scaning
  // 1: asking for PIN and creation/salt date
  // 2: decrypting
  // 3: showing verifiable document data
  // 4: showing legacy document data
  const [step, setStep] = useState(0)

  const [pin, setPin] = useState("")
  const [saltDate, setSaltDate] = useState("")
  const [encryptedData, setEncryptedData] = useState(null)
  const [finalData, setFinalData] = useState(null)
  const [isDocumentVerified, setIsDocumentVerified] = useState(false)
  const [detectedCode, setDetectedCode] = useState(null)

  const [crackSaltDateStart, setCrackSaltDateStart] = useState("")
  const [crackSaltDateEnd, setCrackSaltDateEnd] = useState("")

  const [qrDataMask, setQrDataMask] = useState("")

  useEffect(() => {
    if (location.search.match(/\?fullaccess$/i) && !fullAccess)
      window.fullAccess()

    if (location.search.match(/\?revokefullaccess$/i) && fullAccess)
      window.revokeFullAccess()
  }, [])

  function scanAgain() {
    setStep(0)
    setEncryptedData(null)
    setFinalData(null)
    setIsDocumentVerified(false)

    setPin("")
    crackedPin.value = ""
    crackingPinStatus.value = "not started"

    setSaltDate("")
    crackedSaltDate.value = ""
    crackingSaltDateStatus.value = "not started"

    setCrackSaltDateStart("")
    setCrackSaltDateEnd("")
  }

  const scanAgainButton = (
    <button onClick={scanAgain} className="w-full">
      Scan Again
    </button>
  )

  function copyAsJson() {
    navigator.clipboard.writeText(JSON.stringify(finalData, null, 2))
    toast.success("Decrypted JSON Copied to Clipboard")
  }

  const copyAsJsonButton = (
    <button onClick={copyAsJson} className="w-full">
      Copy as JSON
    </button>
  )

  function Heading({ children }) {
    return (
      <tr>
        <td>
          <h3 style={{ margin: "12px 0 8px" }}>{children}</h3>
        </td>
      </tr>
    )
  }

  if (step === 4) {
    return (
      <div className="whitespace-nowrap">
        <table>
          <tbody>
            <tr>
              <td>{scanAgainButton}</td>
            </tr>
            <tr>
              <td>{copyAsJsonButton}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <Heading>Document Data:</Heading>

            {Object.entries(finalData).map(([label, value]) => {
              const normalizedText =
                nadraDigitalId.normalizeText(value).data || value

              return (
                <tr key={label}>
                  <td>
                    <strong>{label}:</strong>
                  </td>
                  <td
                    className={
                      normalizedText.match(/[\u0600-\u06FF]/) ? "rtl" : ""
                    }
                  >
                    {normalizedText}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const toggleHourCycleButton = (
    <button className="w-full" onClick={() => setIs12HourCycle(!is12HourCycle)}>
      Use {is12HourCycle ? "24h" : "12h"} Time Format
    </button>
  )

  const downloadQRCodeButton = (
    <button
      className="w-full"
      onClick={async () => {
        let payload = detectedCode.text

        if (encryptedData) {
          const jsonString = JSON.stringify(finalData)

          const { data: encodedData, error: encodeError } =
            nadraDigitalId.encode(jsonString)

          if (encodeError) {
            toast.error("Failed to encode data")
            return
          }

          const prefix = finalData.type.includes("NATIONAL_ID")
            ? "URN:VC1:"
            : ""

          payload = prefix + encodedData
        }

        const { ECLevel, DataMask, Version } = JSON.parse(detectedCode.extra)

        const creatorOptions = toCreatorOptionsString(
          encryptedData
            ? { DataMask: qrDataMask }
            : { DataMask, ECLevel, Version },
        )

        const options = {
          scale: 4,
          format: "QRCode",
          options: creatorOptions,
        }

        console.log("Downloading QR Code", { payload, options })

        downloadBarcode(payload, "digital-id-qr-code.png", options)
      }}
    >
      Download QR Code
    </button>
  )

  const downloadEncryptedQRCodeButton = (
    <button
      className="w-full"
      onClick={async () => {
        const payload = detectedCode.text

        // const pin = "0000"
        // const date = new Date()
        // const { proof, ...vc } = JSON.parse(JSON.stringify(finalData))

        // date.setHours(0, 0, 0, 0)

        // const { data: signature, error: signingError } =
        //   await nadraDigitalId.sign(vc)

        // if (signingError) {
        //   toast.error("Failed to sign vc")
        //   return
        // }

        // const signedVC = { ...vc, proof: { ...proof, jws: signature } }

        // const { data: encryptedVC, error: encryptVCError } =
        //   nadraDigitalId.encrypt(JSON.stringify(signedVC), pin, date)

        // if (encryptVCError) {
        //   toast.error("Failed to encrypt vc")
        //   return
        // }

        // const { data: encryptedDate, error: encryptDateError } =
        //   nadraDigitalId.encrypt(
        //     DateTime.fromJSDate(date).toFormat("yyyy-MM-dd HH:mm:ss"),
        //     pin,
        //     date,
        //   )

        // if (encryptDateError) {
        //   toast.error("Failed to encrypt date")
        //   return
        // }

        // const objectToEncode = {
        //   v: "1.0ce",
        //   hash: nadraDigitalId.sha256(pin).data,
        //   date: encryptedDate,
        //   vc: encryptedVC,
        //   fields: [-1],
        // }

        // const jsonString = JSON.stringify(objectToEncode)

        // const jsonString = JSON.stringify(encryptedData)

        // const { data: encodedData, error: encodeError } =
        //   nadraDigitalId.encode(jsonString)

        // if (encodeError) {
        //   toast.error("Failed to encode data")
        //   return
        // }

        // payload = encodedData

        const { ECLevel, DataMask, Version } = JSON.parse(detectedCode.extra)

        const creatorOptions = toCreatorOptionsString({
          DataMask,
          ECLevel,
          Version,
        })

        const options = {
          scale: 4,
          format: "QRCode",
          options: creatorOptions,
        }

        console.log("Downloading Encrypted QR Code", { payload, options })

        downloadBarcode(payload, "digital-id-qr-code.png", options)
      }}
    >
      Download Encrypted QR Code
    </button>
  )

  if (step === 3) {
    return (
      <div className="whitespace-nowrap">
        <table>
          <tbody>
            <tr>
              <td>{scanAgainButton}</td>
            </tr>
            <tr>
              <td>{copyAsJsonButton}</td>
            </tr>
            <tr>
              <td>{toggleHourCycleButton}</td>
            </tr>
            <tr>
              <td>{downloadQRCodeButton}</td>
              {encryptedData && (
                <td>
                  <span style={{ marginRight: "7px" }}>Data Mask</span>
                  <select
                    value={qrDataMask}
                    style={{ fieldSizing: "content" }}
                    onChange={(e) => setQrDataMask(e.target.value)}
                  >
                    <option value="">Auto</option>
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                  </select>
                </td>
              )}
            </tr>
            {encryptedData && (
              <tr>
                <td>{downloadEncryptedQRCodeButton}</td>
              </tr>
            )}
          </tbody>
        </table>

        <table>
          <tbody>
            <Heading>Metadata:</Heading>

            {finalData.id && (
              <tr>
                <td>
                  <strong>ID:</strong>
                </td>
                <td>{finalData.id}</td>
              </tr>
            )}
            {[""].map(() => {
              const type = finalData.type
                ?.toString()
                .split(",")
                .filter((t) => t !== "VerifiableCredential")

              if (!type || type.length === 0) return null

              return (
                <tr key="type">
                  <td>
                    <strong>Type:</strong>
                  </td>
                  <td>{type.join(", ")}</td>
                </tr>
              )
            })}
            {finalData.issuer && (
              <tr>
                <td>
                  <strong>Issuer:</strong>
                </td>
                <td>{finalData.issuer}</td>
              </tr>
            )}
            {finalData.issuanceDate && (
              <tr>
                <td>
                  <strong>Issuance Date:</strong>
                </td>
                <td>
                  {DateTime.fromISO(finalData.issuanceDate).toFormat(
                    dateFormat + (is12HourCycle ? " hh:mm a" : " HH:mm"),
                  )}
                </td>
              </tr>
            )}
            {finalData.expirationDate && (
              <tr>
                <td>
                  <strong>Expiration Date:</strong>
                </td>
                <td>
                  {DateTime.fromISO(finalData.expirationDate).toFormat(
                    dateFormat + (is12HourCycle ? " hh:mm a" : " HH:mm"),
                  )}
                </td>
              </tr>
            )}
            <tr>
              <td>
                <strong>Cryptographic Verification:</strong>
              </td>
              <td>{isDocumentVerified ? "Passed" : "Failed"}</td>
            </tr>
            <tr>
              <td>
                <strong>Is Encrypted:</strong>
              </td>
              <td>{encryptedData ? "Yes" : "No"}</td>
            </tr>
            {encryptedData && (
              <tr>
                <td>
                  <strong>Encrypted Container Version:</strong>
                </td>
                <td>{encryptedData.v || "Unknown"}</td>
              </tr>
            )}

            <Heading>Document Data:</Heading>

            {(() => {
              const fields = Object.values(finalData.credentialSubject)

              const showAllFields =
                fullAccess ||
                !encryptedData?.fields?.length ||
                encryptedData.fields.includes(-1)

              const filteredFields = showAllFields
                ? fields
                : fields.filter((v, i) => encryptedData.fields.includes(i))

              return filteredFields
                .filter((f) => f?.label && f?.value)
                .map((f) => {
                  const normalizedText =
                    nadraDigitalId.normalizeText(f.value).data || f.value
                  return (
                    <tr key={f.label}>
                      <td>
                        <strong>{f.label}:</strong>
                      </td>
                      <td
                        className={
                          normalizedText.match(/[\u0600-\u06FF]/) ? "rtl" : ""
                        }
                      >
                        {normalizedText}
                      </td>
                    </tr>
                  )
                })
            })()}
          </tbody>
        </table>
      </div>
    )
  }

  if (step === 2) {
    return <div>Decrypting Please Wait</div>
  }

  const crackPinAgain = (
    <button onClick={crackPinWrapper} style={{ marginLeft: "4px" }}>
      Crack Again
    </button>
  )

  const crackSaltDateAgain = (
    <button
      onClick={() => {
        setCrackSaltDateStart("")
        setCrackSaltDateEnd("")
        crackingSaltDateStatus.value = "select range"
      }}
      style={{ marginLeft: "4px" }}
    >
      Crack Again
    </button>
  )

  async function crackPinWrapper() {
    const { error, aborted, data, notfound } = await crackPin(
      encryptedData,
      crackingPinRange,
      crackingPinStatus,
    )

    if (error) {
      crackedPin.value = ""
      crackingPinStatus.value = "error"
      toast.error(error)
    }

    if (aborted) {
      crackedPin.value = ""
      crackingPinStatus.value = "not started"
      toast.info("Cracking PIN Aborted")
    }

    if (data) {
      setPin(data)
      crackedPin.value = data
      crackingPinStatus.value = "cracked"
      toast.success("Cracked PIN Successfully")
    }

    if (notfound) {
      crackedPin.value = ""
      crackingPinStatus.value = "not found"
      toast.error("PIN Not Found")
    }
  }

  async function crackSaltDateWrapper(dateStart, dateEnd) {
    const { error, aborted, data, notfound } = await crackSaltDate(
      encryptedData,
      pin,
      dateStart,
      dateEnd,
      dateFormat,
      crackingSaltDateRange,
      crackingSaltDateStatus,
    )

    if (error) {
      crackedSaltDate.value = ""
      crackingSaltDateStatus.value = "error"
      toast.error(error)
    }

    if (aborted) {
      crackedSaltDate.value = ""
      crackingSaltDateStatus.value = "not started"
      toast.info("Cracking Creation Date Aborted")
    }

    if (data) {
      const crackedLDate = DateTime.fromJSDate(data.salt)
      setSaltDate(crackedLDate.toFormat("yyyy-MM-dd"))
      crackedSaltDate.value = crackedLDate.toFormat(dateFormat)
      crackingSaltDateStatus.value = "cracked"
      toast.success("Cracked Creation Date Successfully")

      const { error: verificationError } = await nadraDigitalId.verify(data.vc)
      setIsDocumentVerified(!verificationError)
      setFinalData(data.vc)
      console.log("Decrypted Data", data)
    }

    if (notfound) {
      crackedSaltDate.value = ""
      crackingSaltDateStatus.value = "not found"
      toast.error("Creation Date Not Found")
    }
  }

  async function decryptOrShowDocument() {
    if (crackingSaltDateStatus.value === "cracked") {
      setStep(3)
      return
    }

    if (!saltDate) {
      toast.error("Please select Creation Date")
      return
    }

    setStep(2)

    const date = new Date(saltDate)

    const { error, data, notfound } = await matchSaltDate(
      encryptedData,
      pin,
      date,
      dateFormat,
    )

    if (error) {
      toast.error(error)
      setStep(1)
    }

    if (data) {
      const { error: verificationError } = await nadraDigitalId.verify(data.vc)
      setIsDocumentVerified(!verificationError)
      setFinalData(data.vc)
      console.log("Decrypted Data", data)
      setStep(3)
    }

    if (notfound) {
      toast.error("Wrong Creation Date")
      setStep(1)
    }
  }

  if (step === 1) {
    return (
      <table className="whitespace-nowrap">
        <tbody>
          <tr>
            <td>QR Code PIN</td>
            <td>
              <input
                min={0}
                value={pin}
                type="number"
                placeholder="Enter PIN"
                onChange={(e) => setPin(e.target.value)}
                className="w-full"
              />
            </td>
            {fullAccess && (
              <td>
                {crackingPinStatus.value === "not started" && (
                  <button onClick={crackPinWrapper}>Crack</button>
                )}
                {crackingPinStatus.value === "cracking" && (
                  <>
                    <div
                      style={{
                        gap: "6px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Loading />
                      <span>Cracking Range {crackingPinRange}</span>
                    </div>
                  </>
                )}
                {crackingPinStatus.value === "not found" && (
                  <>
                    <span>No PIN found in range 000000 - 999999</span>
                    {crackPinAgain}
                  </>
                )}
                {crackingPinStatus.value === "cracked" && (
                  <span>Cracked Pin is {crackedPin.value}</span>
                )}
                {crackingPinStatus.value === "error" && (
                  <>
                    <span>Error while cracking PIN</span>
                    {crackPinAgain}
                  </>
                )}
              </td>
            )}
          </tr>
          {crackingSaltDateStatus.value === "select range" && (
            <tr>
              <td></td>
              <td></td>
              <td>Select Range to Brute Force</td>
            </tr>
          )}
          <tr>
            <td>Creation Date</td>
            <td>
              <input
                type="date"
                value={saltDate}
                className="w-full"
                onChange={(e) => setSaltDate(e.target.value)}
              />
            </td>
            {fullAccess && (
              <td>
                {crackingSaltDateStatus.value === "not started" && (
                  <button
                    onClick={() => {
                      crackingSaltDateStatus.value = "select range"
                    }}
                  >
                    Crack
                  </button>
                )}
                {crackingSaltDateStatus.value === "select range" && (
                  <div style={{ display: "flex", gap: "6px" }}>
                    Start
                    <input
                      type="date"
                      min="2025-03-01"
                      value={crackSaltDateStart}
                      onChange={(e) => setCrackSaltDateStart(e.target.value)}
                    />
                    End
                    <input
                      type="date"
                      min="2025-03-02"
                      value={crackSaltDateEnd}
                      onChange={(e) => setCrackSaltDateEnd(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        if (!crackSaltDateStart || !crackSaltDateEnd) {
                          toast.error("Please select both start and end dates")
                          return
                        }

                        const start = new Date(crackSaltDateStart)
                        const end = new Date(crackSaltDateEnd)

                        if (start < end) crackSaltDateWrapper(start, end)
                        else toast.error("End date must be after start date")
                      }}
                    >
                      Start Cracking
                    </button>
                    <button
                      onClick={() => {
                        setCrackSaltDateStart("")
                        setCrackSaltDateEnd("")
                        crackingSaltDateStatus.value = "not started"
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {crackingSaltDateStatus.value === "cracking" && (
                  <>
                    <div
                      style={{
                        gap: "6px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Loading />
                      <span>Cracking with {crackingSaltDateRange}</span>
                    </div>
                  </>
                )}
                {crackingSaltDateStatus.value === "not found" && (
                  <>
                    <span>No Creation Date found in range</span>
                    {crackSaltDateAgain}
                  </>
                )}
                {crackingSaltDateStatus.value === "cracked" && (
                  <span>Cracked Creation Date is {crackedSaltDate}</span>
                )}
                {crackingSaltDateStatus.value === "error" && (
                  <>
                    <span>Error while cracking Creation Date</span>
                    {crackSaltDateAgain}
                  </>
                )}
              </td>
            )}
          </tr>
          <tr>
            <td colSpan={2}>{scanAgainButton}</td>
          </tr>
          <tr>
            <td colSpan={2}>{downloadEncryptedQRCodeButton}</td>
          </tr>
          <tr>
            <td colSpan={2}>
              <button onClick={decryptOrShowDocument} className="w-full">
                {crackingSaltDateStatus.value === "cracked"
                  ? "Show Document"
                  : "Decrypt"}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    )
  }

  return (
    <Scanner
      onScan={async (detectedCodes) => {
        const detectedCode = detectedCodes[0]

        if (!detectedCode) return

        const format = detectedCode.format
        const data = detectedCode.text || ""

        setDetectedCode(detectedCode)

        decoding: {
          if (format === "PDF417") {
            const decoded = data
              .trim()
              .replace(/(.)\x06/g, (m, g) => {
                const code = g.charCodeAt(0)
                if (code === 0x0c) return "،"
                return String.fromCharCode(0x0600 + code)
              })
              .split(/[\r\n]+/)

            function cleanObject(initial = {}) {
              return Object.fromEntries(
                Object.entries(initial).filter(([k, v]) => v !== undefined),
              )
            }

            if (decoded.length < 8 || decoded.length > 9) {
              break decoding
            }

            setFinalData(
              cleanObject(
                decoded[2]?.length === 6
                  ? {
                      Name: decoded[4],
                      "Father/Husband Name": decoded[5],
                      "Identity Number": decoded[1]?.slice(0, 13),
                      "Family Number": decoded[2],
                      "Date of Birth": decoded[3],
                      "Address Line 1": decoded[6],
                      "Address Line 2": decoded[7],
                      "Unknown Field 1": decoded[0],
                    }
                  : {
                      Name: decoded[5],
                      "Father/Husband Name": decoded[6],
                      "Identity Number": decoded[2]?.slice(0, 13),
                      "Family Number": decoded[3],
                      "Date of Birth": decoded[4],
                      "Address Line 1": decoded[7],
                      "Address Line 2": decoded[8],
                      "Unknown Field 1": decoded[0],
                      "Unknown Field 2": decoded[1],
                    },
              ),
            )

            setStep(4)
            return
          }

          if (/^\d+$/.test(data) && data.length === 26) {
            setFinalData({
              "Identity Number": data.slice(12, 25),
              "Card Serial Number": data.slice(0, 12),
            })

            setStep(4)
            return
          }

          const [digits, json] = data.split("\r")
          let parsedJson = null

          try {
            parsedJson = JSON.parse(json)
          } catch (e) {}

          if (/^\d+$/.test(digits) && parsedJson) {
            setFinalData(parsedJson)
            setStep(4)
            return
          }

          const { data: decoded, error: decodeError } =
            nadraDigitalId.decode(data)

          if (decodeError) {
            console.log("Failed to decode data", decodeError)
            break decoding
          }

          let decodedObject
          try {
            decodedObject = JSON.parse(decoded)
          } catch (e) {
            console.log("Failed to parse decoded string", [decoded])
            break decoding
          }

          console.log("Decoded Data", decodedObject)

          const isUnencrypted = "credentialSubject" in decodedObject

          if (isUnencrypted) {
            const { error: verificationError } =
              await nadraDigitalId.verify(decodedObject)

            setIsDocumentVerified(!verificationError)
            setFinalData(decodedObject)
            setStep(3)
            return
          }

          setEncryptedData(decodedObject)
          setStep(1)
          return
        }

        const genericFormatName = genericFormatNames[format]
        const formatUsedOnDocuments = formatsUsedOnDocuments[format]

        // prettier-ignore
        toast.error(
          "Scanned " + genericFormatName + " is not a valid NADRA " +
          formatUsedOnDocuments.join(" or ") + " " + genericFormatName
        )
      }}
    />
  )
}
