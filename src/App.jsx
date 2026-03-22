import { useState } from "react"
import { DateTime } from "luxon"
import { toast } from "react-toastify"
import nadraDigitalId from "nadra-digital-id"
import Scanner from "./Scanner.jsx"

// nadraDigitalId.setDebug(true)

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
  // 1: ask for pin and genration date
  // 2: decrypting
  // 3: show data
  const [step, setStep] = useState(0)

  const [pin, setPin] = useState("")
  const [generationDate, setGenerationDate] = useState(() =>
    DateTime.now().startOf("day").toISODate(),
  )
  const [decodedData, setDecodedData] = useState(null)
  const [decryptedData, setDecryptedData] = useState(null)
  const [isDocumentVerified, setIsDocumentVerified] = useState(false)

  if (step === 3) {
    return (
      <div className="whitespace-nowrap">
        <table>
          <tbody>
            <tr>
              <td>
                <button
                  onClick={() => setStep(0)}
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
                    is12HourCycle ? "yyyy/MM/dd hh:mm a" : "yyyy/MM/dd HH:mm",
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
                    is12HourCycle ? "yyyy/MM/dd hh:mm a" : "yyyy/MM/dd HH:mm",
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
            : "⚠️ This document is Tampered"}
        </h3>
      </div>
    )
  }

  if (step === 2) {
    return <div>Decrypting Please Wait</div>
  }

  if (step === 1) {
    return (
      <table className="whitespace-nowrap">
        <tbody>
          <tr>
            <td>QR Code PIN</td>
            <td>
              <input
                value={pin}
                type="number"
                placeholder="Enter PIN"
                onChange={(e) => setPin(e.target.value)}
                style={{ width: "-webkit-fill-available" }}
              />
            </td>
          </tr>
          <tr>
            <td>Genration Date</td>
            <td>
              <input
                type="date"
                value={generationDate}
                style={{ width: "-webkit-fill-available" }}
                onChange={(e) => setGenerationDate(e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <button
                onClick={() => setStep(0)}
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

                  const genDate = DateTime.fromISO(generationDate)

                  const { data: timeValues, error: timeRangeError } =
                    nadraDigitalId.timeRange({
                      bounds: {
                        start: genDate.toJSDate(),
                        end: genDate.plus({ days: 1 }).toJSDate(),
                      },
                    })

                  if (timeRangeError) {
                    toast.error("Failed to calculate time range")
                    return
                  }

                  setStep(2)

                  setTimeout(async () => {
                    let vc = null

                    for (const time of timeValues) {
                      const result = nadraDigitalId.decrypt(
                        decodedData.vc,
                        pin,
                        time,
                      )
                      if (result.data) {
                        try {
                          vc = JSON.parse(result.data)
                          break
                        } catch (e) {}
                      }
                    }

                    if (!vc) {
                      setStep(1)
                      toast.error("Wrong Generation Date")
                      return
                    }

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

          if ("credentialSubject" in decoded) {
            const { error: verificationError } =
              await nadraDigitalId.verify(decoded)

            setIsDocumentVerified(!verificationError)
            setDecryptedData(decoded)
            setStep(3)
            return
          }

          setDecodedData(decoded)
          setStep(1)
        }}
      />
    </div>
  )
}
