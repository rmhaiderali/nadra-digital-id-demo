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
  overrides: { locateFile: (path, prefix) => filePaths[path] ?? path + prefix },
})

const dateDelimiter =
  new Date().toLocaleDateString().match(/[\-|\/|\.|]/)?.[0] || "/"

const dateFormat = "yyyy" + dateDelimiter + "MM" + dateDelimiter + "dd"

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  const [devices, setDevices] = useState(null)
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(null)

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
  const [decodedData, setDecodedData] = useState(null)
  const [decryptedData, setDecryptedData] = useState(null)
  const [isDocumentVerified, setIsDocumentVerified] = useState(false)

  const [crackSaltDateStart, setCrackSaltDateStart] = useState("")
  const [crackSaltDateEnd, setCrackSaltDateEnd] = useState("")

  useEffect(() => {
    if (location.search.match(/\?fullaccess/i) && !fullAccess)
      window.fullAccess()

    if (location.search.match(/\?revokefullaccess/i) && fullAccess)
      window.revokeFullAccess()
  }, [])

  function scanAgain() {
    setStep(0)

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
    <button onClick={scanAgain} style={{ width: "-webkit-fill-available" }}>
      Scan Again
    </button>
  )

  function copyAsJson() {
    navigator.clipboard.writeText(JSON.stringify(decryptedData, null, 2))
    toast.success("Decrypted JSON Copied to Clipboard")
  }

  const copyAsJsonButton = (
    <button onClick={copyAsJson} style={{ width: "-webkit-fill-available" }}>
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

            {Object.entries(decryptedData).map(([label, value]) => (
              <tr key={label}>
                <td>
                  <strong>{label}:</strong>
                </td>
                <td
                  className={
                    [
                      "Name",
                      "Father/Husband Name",
                      "Address Line 1",
                      "Address Line 2",
                    ].includes(label)
                      ? "urdu"
                      : ""
                  }
                >
                  {nadraDigitalId.normalizeText(value).data || value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const toggleHourCycleButton = (
    <button
      style={{ width: "-webkit-fill-available" }}
      onClick={() => setIs12HourCycle(!is12HourCycle)}
    >
      Use {is12HourCycle ? "24h" : "12h"} Time Format
    </button>
  )

  const downloadQRCodeButton = (
    <button
      style={{ width: "-webkit-fill-available" }}
      onClick={async () => {
        // const pin = "0000"
        // const date = new Date()
        // const { proof, ...vc } = JSON.parse(JSON.stringify(decryptedData))

        // date.setHours(0, 0, 0, 0)

        // const { data: signature, error: signingError } =
        //   await nadraDigitalId.sign(vc)

        // if (signingError) {
        //   toast.error("Failed to sign vc")
        //   return
        // }

        // const signedVC = { ...vc, proof: { ...proof, jws: signature } }

        // const { data: encryptedData, error: encryptDataError } =
        //   nadraDigitalId.encrypt(JSON.stringify(signedVC), pin, date)

        // if (encryptDataError) {
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
        //   vc: encryptedData,
        //   fields: [-1],
        // }

        // const jsonString = JSON.stringify(objectToEncode)

        const jsonString = JSON.stringify(decryptedData)

        const { data: encodedData, error: encodeError } =
          nadraDigitalId.encode(jsonString)

        if (encodeError) {
          toast.error("Failed to encode data")
          return
        }

        // download QR code as an image

        const options = { format: "QRCode", scale: 4, options: "dataMask=2" }

        const { error, image } = await writeBarcode(encodedData, options)

        if (error) {
          toast.error("Failed to generate QR code")
          console.log(error)
          return
        }

        downloadBlob(image, "nadra-digital-id-qr-code.png")
      }}
    >
      Download QR Code
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
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <Heading>Metadata:</Heading>

            {decryptedData.id && (
              <tr>
                <td>
                  <strong>ID:</strong>
                </td>
                <td>{decryptedData.id}</td>
              </tr>
            )}
            {[""].map(() => {
              const type = decryptedData.type
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
            {decryptedData.issuer && (
              <tr>
                <td>
                  <strong>Issuer:</strong>
                </td>
                <td>{decryptedData.issuer}</td>
              </tr>
            )}
            {decryptedData.issuanceDate && (
              <tr>
                <td>
                  <strong>Issuance Date:</strong>
                </td>
                <td>
                  {DateTime.fromISO(decryptedData.issuanceDate).toFormat(
                    dateFormat + (is12HourCycle ? " hh:mm a" : " HH:mm"),
                  )}
                </td>
              </tr>
            )}
            {decryptedData.expirationDate && (
              <tr>
                <td>
                  <strong>Expiration Date:</strong>
                </td>
                <td>
                  {DateTime.fromISO(decryptedData.expirationDate).toFormat(
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

            <Heading>Document Data:</Heading>

            {(() => {
              const fields = Object.values(decryptedData.credentialSubject)

              const filteredFields =
                fullAccess ||
                !decodedData?.fields?.length ||
                decodedData.fields.includes(-1)
                  ? fields
                  : fields.filter((v, i) => decodedData.fields.includes(i))

              return filteredFields
                .filter((f) => f?.label && f?.value)
                .map((f) => (
                  <tr key={f.label}>
                    <td>
                      <strong>{f.label}:</strong>
                    </td>
                    <td
                      className={
                        /urdu/i.test(f.label) ||
                        ["Temporary Address", "Permanent Address"].includes(
                          f.label,
                        )
                          ? "urdu"
                          : ""
                      }
                    >
                      {nadraDigitalId.normalizeText(f.value).data || f.value}
                    </td>
                  </tr>
                ))
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
      decodedData,
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
      decodedData,
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
      setDecryptedData(data.vc)
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
      decodedData,
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
      setDecryptedData(data.vc)
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
                style={{ width: "-webkit-fill-available" }}
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
                style={{ width: "-webkit-fill-available" }}
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
            <td colSpan={2}>
              <button
                onClick={decryptOrShowDocument}
                style={{ width: "-webkit-fill-available" }}
              >
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
    <div
      className="no-margin"
      style={{ width: "100dvw", height: "100dvh", background: "black" }}
    >
      <Scanner
        devices={devices}
        setDevices={setDevices}
        currentDeviceIndex={currentDeviceIndex}
        setCurrentDeviceIndex={setCurrentDeviceIndex}
        onScan={async (detectedCodes) => {
          const format = detectedCodes[0]?.format
          const data = detectedCodes[0]?.rawValue || ""

          if (format === "pdf417") {
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
                Object.entries(initial).filter(([, v]) => v !== undefined),
              )
            }

            setDecryptedData(
              cleanObject(
                decoded[2].length === 6
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
            setDecryptedData({
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
            setDecryptedData(parsedJson)
            setStep(4)
            return
          }

          const { data: decoded, error: decodeError } =
            nadraDigitalId.decode(data)

          if (decodeError) {
            toast.error(decodeError)
            return
          }

          let decodedObject
          try {
            decodedObject = JSON.parse(decoded)
          } catch (e) {
            toast.error("Failed to parse decoded data")
            return
          }

          console.log("Decoded Data", decodedObject)

          const isUnencrypted = "credentialSubject" in decodedObject

          if (isUnencrypted) {
            const { error: verificationError } =
              await nadraDigitalId.verify(decodedObject)

            setIsDocumentVerified(!verificationError)
            setDecryptedData(decodedObject)
            setStep(3)
            return
          }

          setDecodedData(decodedObject)
          setStep(1)
        }}
      />
    </div>
  )
}
