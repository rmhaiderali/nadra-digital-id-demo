import { useState } from "react"
import { DateTime } from "luxon"
import { Fraction } from "fraction.js"
import { toast } from "react-toastify"
import nadraDigitalId from "nadra-digital-id"
import { Scanner } from "@yudiel/react-qr-scanner"

// nadraDigitalId.setDebug(true)

function App() {
  const [stats, setStats] = useState(false)
  const [torch, setTorch] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)

  const [deviceIndex, setDeviceIndex] = useState(0)
  const [facingMode, setFacingMode] = useState("environment")
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

  const [dimensions, setDimensions] = useState(null)
  const [orgDimensions, setOrgDimensions] = useState(null)

  const [devices, setDevices] = useState([])
  const currentDevice = devices?.[deviceIndex]

  const width = dimensions?.width
  const height = dimensions?.height
  const orgWidth = orgDimensions?.width
  const orgHeight = orgDimensions?.height

  const isMobile = navigator.userAgent.match(/Android|iPhone/i)

  const [swapWidth, swapHeight] = isMobile ? [height, width] : [width, height]

  const [swapOrgWidth, swapOrgHeight] = isMobile
    ? [orgHeight, orgWidth]
    : [orgWidth, orgHeight]

  const aspectRatio = new Fraction(swapWidth, swapHeight).toFraction()
  const orgAspectRatio = new Fraction(swapOrgWidth, swapOrgHeight).toFraction()

  if (step === 3) {
    return (
      <div>
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
      <table>
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

  // console.log("devices", devices)
  // console.log("currentDevice", currentDevice)
  // console.log("deviceId", currentDevice?.deviceId)

  return (
    <div
      className="no-margin"
      style={{ width: "100dvw", height: "100dvh", background: "black" }}
    >
      <Scanner
        components={{ finder: false }}
        formats={["qr_code"]}
        constraints={{
          width,
          height,
          facingMode: null,
          resizeMode: "none",
          advanced: [{ torch }],
          deviceId: currentDevice?.deviceId,
        }}
        styles={{
          video: {
            objectFit: "contain",
            transform: facingMode === "user" ? "scaleX(-1)" : "none",
          },
          container: { display: dimensions ? "block" : "none" },
        }}
        onResult={(result, error) => {
          console.log("result", result, "error", error)
        }}
        onScan={(detectedCodes) => {
          const data = detectedCodes[0]?.rawValue

          const { data: decoded, error: decodeError } =
            nadraDigitalId.decode(data)

          if (decodeError) {
            toast.error(
              "Failed to decode, make sure its NADRA Digital ID QR code",
            )
            return
          }

          setDecodedData(decoded)
          setStep(1)
        }}
        onCamera={async ({ capabilities, settings, currentVideoTrack }) => {
          const constraints = currentVideoTrack?.current?.getConstraints()

          function stringOrNull(value) {
            return typeof value === "string" ? value : null
          }

          const facingMode =
            stringOrNull(settings?.facingMode) ??
            stringOrNull(constraints?.facingMode) ??
            stringOrNull(capabilities?.facingMode?.[0]) ??
            (currentDevice?.label.match(/front|user|Integrated Webcam/i)
              ? "user"
              : "environment")

          // console.log("facingMode", facingMode)
          setFacingMode(facingMode)

          const w = capabilities?.width?.max
          const h = capabilities?.height?.max
          if (!w || !h) return
          if (w === width && h === height) return

          // console.log("settings", settings)
          // console.log("constraints", constraints)
          // console.log("capabilities", capabilities)
          // console.log("currentVideoTrack", currentVideoTrack)

          const s = Math.min(w, h)
          const d = s / Math.min(1000, s)
          setOrgDimensions({ width: w, height: h })
          setDimensions({
            width: Math.round(w / d),
            height: Math.round(h / d),
          })

          const devices = await navigator.mediaDevices.enumerateDevices()
          setDevices(devices.filter((d) => d.kind === "videoinput"))

          setTorchAvailable(capabilities?.torch)
        }}
      />
      <div
        style={{
          inset: 0,
          position: "absolute",
          alignContent: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            aspectRatio,
            margin: "auto",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
          onClick={() => setStats((s) => !s)}
        >
          <div
            style={{
              color: "white",
              background: "#000",
              position: "absolute",
              fontFamily: "serif",
              display: stats ? "block" : "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%" }}>
              <div style={{ margin: "4px" }}>Facing mode: {facingMode}</div>
              <div style={{ margin: "4px" }}>
                Device: {currentDevice?.label}
              </div>
              <div style={{ margin: "4px" }}>
                Width: {swapWidth}, Height: {swapHeight}, Ratio:{" "}
                {orgAspectRatio}
              </div>
              {devices?.length > 1 && (
                <div
                  onClick={() =>
                    setDeviceIndex((deviceIndex + 1) % devices.length)
                  }
                  style={{ margin: "4px", cursor: "pointer", color: "#00bfff" }}
                >
                  {"Change to "}
                  {devices?.[(deviceIndex + 1) % devices.length]?.label}
                </div>
              )}
              {torchAvailable && (
                <div
                  onClick={() => setTorch((prev) => !prev)}
                  style={{
                    margin: "4px",
                    cursor: "pointer",
                    color: "#ffff00cf",
                  }}
                >
                  {torch ? "Turn off" : "Turn on"} torch
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              width: "100%",
              color: "black",
              minHeight: "3px",
              background: "red",
              textAlign: "center",
              position: "relative",
              animation: dimensions
                ? "slide 6s ease-in-out infinite alternate"
                : "none",
            }}
          >
            {!dimensions && "Give camera access and reload"}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
