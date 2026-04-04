import ms from "ms"
import { DateTime } from "luxon"
import { toast } from "react-toastify"
import { useState, useRef } from "react"
import nadraDigitalId from "nadra-digital-id"
import Scanner from "./Scanner.jsx"
import Loading from "./Loading.jsx"
import { writeBarcode, prepareZXingModule } from "zxing-wasm/writer"
import zxingWriterWasmUrl from "/node_modules/zxing-wasm/dist/writer/zxing_writer.wasm?url"

// nadraDigitalId.setDebug(true)

const filePaths = { "zxing_writer.wasm": zxingWriterWasmUrl }

prepareZXingModule({
  overrides: { locateFile: (path, prefix) => filePaths[path] ?? path + prefix },
})

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

function range(start, end, step = 1) {
  const result = []
  for (let i = start; i <= end; i += step) result.push(i)
  return result
}

function chunkArray(arr, size) {
  const result = []

  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }

  return result
}

function passwordRangeToString(range) {
  const start = range[0]
  const end = range.at(-1)
  const formattedStart = start.toString().padStart(4, "0")
  const formattedEnd = end.toString().padStart(4, "0")
  return formattedStart + " - " + formattedEnd
}

function isValidBase64(str) {
  try {
    // throw new Error("Invalid Base64")
    return btoa(atob(str)) === str
  } catch (err) {
    return false
  }
}

async function downloadQRCode(data, filename) {
  const options = { format: "QRCode", scale: 4 }
  const { error, image } = await writeBarcode(data, options)
  if (error) {
    toast.error("Failed to generate QR code")
    return
  }
  downloadBlob(image, filename)
}

const dateDelimiter =
  new Date().toLocaleDateString().match(/[\-|\/|\.|]/)?.[0] || "/"

const dayMs = ms("1d")

function dateToUnixDay(date) {
  return Math.floor(date.getTime() / dayMs)
}

function unixDayToDate(unixDay) {
  return new Date(unixDay * dayMs)
}

const superiorDateFormat = "yyyy" + dateDelimiter + "MM" + dateDelimiter + "dd"

window.iamagoodguy = () => {
  localStorage.setItem("goodguy", "true")
  toast.success("Yes, you are a good guy! 😇")
  setTimeout(() => window.location.reload(), 2000)
}

const isGoodGuy = localStorage.getItem("goodguy") === "true"

export default function App() {
  const [devices, setDevices] = useState(null)
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(null)

  const [is12HourCycle, setIs12HourCycle] = useState(() =>
    JSON.parse(localStorage.getItem("is12HourCycle") ?? "true"),
  )

  function toggleHourCycle() {
    setIs12HourCycle((prev) => {
      const newValue = !prev
      localStorage.setItem("is12HourCycle", newValue)
      return newValue
    })
  }

  // 0: scan
  // 1: ask for pin and generation date
  // 2: decrypting
  // 3: show data
  const [step, setStep] = useState(0)

  const [pin, setPin] = useState("")
  const [generationDate, setGenerationDate] = useState("")
  const [decodedData, setDecodedData] = useState(null)
  const [decryptedData, setDecryptedData] = useState(null)
  const [isDocumentVerified, setIsDocumentVerified] = useState(false)

  const [crackedPin, setCrackedPin] = useState("")
  const [crackingPinRange, setCrackingPinRange] = useState("")
  const [crackingPinStatus, _setCrackingPinStatus] = useState("not started")
  //
  const crackingPinStatusRef = useRef(crackingPinStatus)
  const setCrackingPinStatus = (status) => {
    _setCrackingPinStatus(status)
    crackingPinStatusRef.current = status
  }
  //
  const [crackedGenerationDate, setCrackedGenerationDate] = useState("")
  const [crackingGenerationDateRange, setCrackingGenerationDateRange] =
    useState("")
  const [crackingGenerationDateStatus, _setCrackingGenerationDateStatus] =
    useState("not started")
  //
  const crackingGenerationDateStatusRef = useRef(crackingGenerationDateStatus)
  const setCrackingGenerationDateStatus = (status) => {
    _setCrackingGenerationDateStatus(status)
    crackingGenerationDateStatusRef.current = status
  }
  //
  const [crackGenerationDateStart, setCrackGenerationDateStart] = useState("")
  const [crackGenerationDateEnd, setCrackGenerationDateEnd] = useState("")

  function scanAgain() {
    setStep(0)

    setPin("")
    setCrackedPin("")
    setCrackingPinStatus("not started")

    setGenerationDate()
    setCrackedGenerationDate("")
    setCrackingGenerationDateStatus("not started")

    setCrackGenerationDateStart("")
    setCrackGenerationDateEnd("")
  }

  async function crackPin() {
    setCrackingPinStatus("cracking")

    const pinHash = decodedData.hash

    if (!pinHash) {
      setCrackingPinStatus("error")
      console.log("No hash found in the QR code data.")
      return
    }

    if (pinHash.length !== 64) {
      setCrackingPinStatus("error")
      console.log("Wrong hash length. Not valid SHA-256 hash.")
      return
    }

    let error = false
    let crackedPin = null

    main: for (const chunk of chunkArray(range(0, 999999), 100)) {
      setCrackingPinRange(passwordRangeToString(chunk))

      // wait a tick to update the UI with the new range being tried
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (crackingPinStatusRef.current !== "cracking") return

      for (const i of chunk) {
        const pinsToCrack = []

        if (i < 10000) pinsToCrack.push(i.toString().padStart(4, "0"))

        if (i < 100000) pinsToCrack.push(i.toString().padStart(5, "0"))

        pinsToCrack.push(i.toString().padStart(6, "0"))

        for (const pinToCrack of pinsToCrack) {
          const { data: possiblePinHash, error: possiblePinHashError } =
            nadraDigitalId.sha256(pinToCrack)

          if (possiblePinHashError) {
            console.log("Error while hashing PIN:", possiblePinHashError)
            error = true
            break main
          }

          if (pinHash === possiblePinHash) {
            crackedPin = pinToCrack
            break main
          }
        }
      }
    }

    setCrackingPinRange("")

    if (error) {
      setCrackedPin("")
      setCrackingPinStatus("error")
      return
    }

    if (crackedPin) {
      setPin(crackedPin)
      setCrackedPin(crackedPin)
      setCrackingPinStatus("cracked")
      return
    }

    setCrackedPin("")
    setCrackingPinStatus("not found")
  }

  async function crackGenerationDate(start, end) {
    const { data: pinHash, error: pinHashError } = nadraDigitalId.sha256(pin)

    if (pinHashError) {
      toast.error("Failed to hash PIN")
      return
    }

    if (pinHash !== decodedData.hash) {
      toast.error("Wrong PIN")
      return
    }

    setCrackingGenerationDateStatus("cracking")

    const vc = decodedData.vc

    if (!isValidBase64(vc)) {
      setCrackingGenerationDateStatus("error")
      console.log("VC is not a valid Base64 string.")
      return
    }

    const startUnixDay = dateToUnixDay(start)
    const endUnixDay = dateToUnixDay(end)

    let error = false
    let crackedDate = null

    main: for (const unixDay of range(startUnixDay, endUnixDay)) {
      const dateToCrack = DateTime.fromJSDate(unixDayToDate(unixDay), {
        zone: "utc",
      }).setZone("Asia/Karachi", { keepLocalTime: true })

      setCrackingGenerationDateRange(dateToCrack.toFormat(superiorDateFormat))

      const { data: timeValues, error: timeRangeError } =
        nadraDigitalId.timeRange({
          bounds: {
            start: dateToCrack.toJSDate(),
            end: dateToCrack.endOf("day").toJSDate(),
          },
        })

      if (timeRangeError) {
        console.log("Failed to calculate time range")
        error = true
        break main
      }

      console.log("Time Range", timeValues)

      for (const time of timeValues) {
        // wait a tick to update the UI with the new range being tried
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (crackingGenerationDateStatusRef.current !== "cracking") return

        const result = nadraDigitalId.decrypt(vc, pin, time)

        if (result.data) {
          try {
            JSON.parse(result.data)
            crackedDate = time
            break main
          } catch (e) {}
        }
      }
    }

    setCrackingGenerationDateRange("")

    if (error) {
      setCrackedGenerationDate("")
      setCrackingGenerationDateStatus("error")
      return
    }

    if (crackedDate) {
      const crackedDateLuxon = DateTime.fromJSDate(crackedDate)
      setGenerationDate(crackedDateLuxon.toFormat("yyyy-MM-dd"))
      setCrackedGenerationDate(crackedDateLuxon.toFormat(superiorDateFormat))
      setCrackingGenerationDateStatus("cracked")
      return
    }

    setCrackedGenerationDate("")
    setCrackingGenerationDateStatus("not found")
  }

  if (step === 3) {
    return (
      <div className="whitespace-nowrap">
        <table>
          <tbody>
            <tr>
              <td>
                <button
                  onClick={scanAgain}
                  style={{ width: "-webkit-fill-available" }}
                >
                  Scan Again
                </button>
              </td>
            </tr>
            <tr>
              <td>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(decryptedData, null, 2),
                    )
                    toast.success("Decrypted JSON Copied to Clipboard")
                  }}
                  style={{ width: "-webkit-fill-available" }}
                >
                  Copy Decrypted JSON
                </button>
              </td>
            </tr>
            <tr>
              <td>
                <button
                  onClick={toggleHourCycle}
                  style={{ width: "-webkit-fill-available" }}
                >
                  Use {is12HourCycle ? "24h" : "12h"} Time Format
                </button>
              </td>
            </tr>
            <tr>
              <td>
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

                    downloadQRCode(encodedData, "nadra-digital-id-qr-code.png")
                  }}
                >
                  Download QR Code
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginBottom: "8px" }}>QR Code Metadata:</h3>
        <table>
          <tbody>
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
                    superiorDateFormat +
                      (is12HourCycle ? " hh:mm a" : " HH:mm"),
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
                    superiorDateFormat +
                      (is12HourCycle ? " hh:mm a" : " HH:mm"),
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h3 style={{ marginBottom: "8px" }}>Document Data:</h3>
        <table>
          <tbody>
            {Object.values(decryptedData.credentialSubject)
              .filter((f) => f?.label && f?.value)
              .map((f) => (
                <tr key={f.label}>
                  <td>
                    <strong>{f.label}:</strong>
                  </td>
                  <td>
                    {nadraDigitalId.normalizeText(f.value).data || f.value}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <h3 style={{ marginBottom: "8px" }}>
          {isDocumentVerified
            ? "✅ This document is Authentic"
            : "⚠️ Authenticity could not be verified"}
        </h3>
      </div>
    )
  }

  if (step === 2) {
    return <div>Decrypting Please Wait</div>
  }

  const crackPinAgain = (
    <button onClick={crackPin} style={{ marginLeft: "4px" }}>
      Crack Again
    </button>
  )

  const crackGenerationDateAgain = (
    <button
      onClick={() => {
        setCrackGenerationDateStart("")
        setCrackGenerationDateEnd("")
        setCrackingGenerationDateStatus("select range")
      }}
      style={{ marginLeft: "4px" }}
    >
      Crack Again
    </button>
  )

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
            {isGoodGuy && (
              <td>
                {crackingPinStatus === "not started" && (
                  <button onClick={crackPin}>Crack</button>
                )}
                {crackingPinStatus === "cracking" && (
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
                {crackingPinStatus === "not found" && (
                  <>
                    <span>No PIN found in range 000000 - 999999</span>
                    {crackPinAgain}
                  </>
                )}
                {crackingPinStatus === "cracked" && (
                  <span>Cracked Pin is {crackedPin}</span>
                )}
                {crackingPinStatus === "error" && (
                  <>
                    <span>Error while cracking PIN</span>
                    {crackPinAgain}
                  </>
                )}
              </td>
            )}
          </tr>
          {crackingGenerationDateStatus === "select range" && (
            <tr>
              <td></td>
              <td></td>
              <td>Select Range to Brute Force</td>
            </tr>
          )}
          <tr>
            <td>Generation Date</td>
            <td>
              <input
                type="date"
                value={generationDate}
                style={{ width: "-webkit-fill-available" }}
                onChange={(e) => setGenerationDate(e.target.value)}
              />
            </td>
            {isGoodGuy && (
              <td>
                {crackingGenerationDateStatus === "not started" && (
                  <button
                    onClick={() =>
                      setCrackingGenerationDateStatus("select range")
                    }
                  >
                    Crack
                  </button>
                )}
                {crackingGenerationDateStatus === "select range" && (
                  <div style={{ display: "flex", gap: "6px" }}>
                    Start
                    <input
                      type="date"
                      min="2025-03-01"
                      value={crackGenerationDateStart}
                      onChange={(e) =>
                        setCrackGenerationDateStart(e.target.value)
                      }
                    />
                    End
                    <input
                      type="date"
                      min="2025-03-02"
                      value={crackGenerationDateEnd}
                      onChange={(e) =>
                        setCrackGenerationDateEnd(e.target.value)
                      }
                    />
                    <button
                      onClick={() => {
                        if (
                          !crackGenerationDateStart ||
                          !crackGenerationDateEnd
                        ) {
                          toast.error("Please select both start and end dates")
                          return
                        }

                        const start = new Date(crackGenerationDateStart)
                        const end = new Date(crackGenerationDateEnd)

                        if (start < end) crackGenerationDate(start, end)
                        else toast.error("End date must be after start date")
                      }}
                    >
                      Start Cracking
                    </button>
                    <button
                      onClick={() => {
                        setCrackGenerationDateStart("")
                        setCrackGenerationDateEnd("")
                        setCrackingGenerationDateStatus("not started")
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {crackingGenerationDateStatus === "cracking" && (
                  <>
                    <div
                      style={{
                        gap: "6px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Loading />
                      <span>Cracking with {crackingGenerationDateRange}</span>
                    </div>
                  </>
                )}
                {crackingGenerationDateStatus === "not found" && (
                  <>
                    <span>No Generation Date found in range</span>
                    {crackGenerationDateAgain}
                  </>
                )}
                {crackingGenerationDateStatus === "cracked" && (
                  <span>
                    Cracked Generation Date is {crackedGenerationDate}
                  </span>
                )}
                {crackingGenerationDateStatus === "error" && (
                  <>
                    <span>Error while cracking Generation Date</span>
                    {crackGenerationDateAgain}
                  </>
                )}
              </td>
            )}
          </tr>
          <tr>
            <td colSpan={2}>
              <button
                onClick={scanAgain}
                style={{ width: "-webkit-fill-available" }}
              >
                Scan Again
              </button>
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <button
                onClick={() => {
                  const { data: pinHash, error: pinHashError } =
                    nadraDigitalId.sha256(pin)

                  if (pinHashError) {
                    toast.error("Failed to hash PIN")
                    return
                  }

                  if (decodedData.hash !== pinHash) {
                    toast.error("Wrong PIN")
                    return
                  }

                  if (!generationDate) {
                    toast.error("Please select Generation Date")
                    return
                  }

                  const dateToCrack = DateTime.fromISO(generationDate, {
                    zone: "Asia/Karachi",
                  })

                  const { data: timeValues, error: timeRangeError } =
                    nadraDigitalId.timeRange({
                      bounds: {
                        start: dateToCrack.toJSDate(),
                        end: dateToCrack.endOf("day").toJSDate(),
                      },
                    })

                  if (timeRangeError) {
                    toast.error("Failed to calculate time range")
                    return
                  }

                  console.log("Time Range", timeValues)

                  setStep(2)

                  setTimeout(async () => {
                    let vc = null
                    let date = null

                    for (const time of timeValues) {
                      const result = nadraDigitalId.decrypt(
                        decodedData.vc,
                        pin,
                        time,
                      )
                      if (result.data) {
                        try {
                          vc = JSON.parse(result.data)
                          const r = nadraDigitalId.decrypt(
                            decodedData.date,
                            pin,
                            time,
                          )
                          if (r.data) date = new Date(r.data + "Z")
                          break
                        } catch (e) {}
                      }
                    }

                    if (!vc) {
                      setStep(1)
                      toast.error("Wrong Generation Date")
                      return
                    }

                    console.log("Decrypted VC", vc)
                    console.log("Decrypted Date", date)

                    const { error: verificationError } =
                      await nadraDigitalId.verify(vc)

                    setIsDocumentVerified(!verificationError)
                    setDecryptedData(vc)
                    setStep(3)
                  }, 100)
                }}
                style={{ width: "-webkit-fill-available" }}
              >
                Decrypt
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
          const data = detectedCodes[0]?.rawValue

          const { data: decoded, error: decodeError } =
            nadraDigitalId.decode(data)

          if (decodeError) {
            toast.error(
              "Failed to decode, make sure its NADRA Digital ID QR code",
            )
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

          if ("credentialSubject" in decodedObject) {
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
