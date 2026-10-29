import "webrtc-adapter"
import { Fraction } from "fraction.js"
import { useEffect, useState, useRef } from "react"
import { getImageDataOrBlobFromImageBitmapSource } from "./barcode-detector/utils"
import Camera from "./Camera.jsx"
import Worker from "./workers/scanner.js?worker"
import FeatureCheckWorker from "./workers/feature-check.js?worker"

screen.orientation ??= {
  angle: 0,
  addEventListener: () => {},
  removeEventListener: () => {},
}

function cleanDeviceName(name) {
  return name?.replace(/[^a-zA-Z0-9]+/g, " ")
}

export default function Scanner({ onScan = () => {}, scanDelay = 500 }) {
  const videoRef = useRef(null)
  const inputRef = useRef(null)
  const workerRef = useRef(null)
  const workerFeatures = useRef({})
  const [stats, setStats] = useState(false)
  const [torch, setTorch] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [dimensions, setDimensions] = useState({})
  const [changingDevice, setChangingDevice] = useState(false)
  const [haveVideoDevices, setHaveVideoDevices] = useState(null)
  const angleRef = useRef(screen.orientation.angle)

  const [info, setInfo] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState("")

  const currentDeviceIndex = devices.findIndex((d) => d.deviceId === deviceId)
  const currentDevice = devices[currentDeviceIndex]

  const frontCameraRegex = /front|user|Integrated Webcam/i

  const facingMode =
    info?.facingMode ||
    (frontCameraRegex.test(currentDevice?.label || "") ? "user" : "environment")

  const isTorchAvailable = info?.torch

  useEffect(() => {
    async function checkHasVideoDevices() {
      const newDevices = await navigator.mediaDevices?.enumerateDevices?.()
      setHaveVideoDevices(!!newDevices?.some((d) => d.kind === "videoinput"))
    }

    checkHasVideoDevices()

    async function handleOrientation(event) {
      if (angleRef.current % 180 !== event.target.angle % 180)
        setDimensions(({ width, height }) => ({ width: height, height: width }))
      angleRef.current = event.target.angle
    }

    screen.orientation.addEventListener("change", handleOrientation)

    return () => {
      screen.orientation.removeEventListener("change", handleOrientation)
    }
  }, [])

  async function bitmapToSendable(bitmap) {
    if (workerFeatures.current.offscreenCanvas) return [bitmap, bitmap]

    const result = await getImageDataOrBlobFromImageBitmapSource(bitmap)

    if (result instanceof Blob) return [result, result]

    if (result instanceof ImageData) return [result, result.data.buffer]

    console.log("Failed to convert ImageBitmap to ImageData or Blob")

    return null
  }

  useEffect(() => {
    const featureCheckWorker = new FeatureCheckWorker()

    featureCheckWorker.onmessage = (e) => {
      console.log("Worker Features", e.data)
      workerFeatures.current = e.data
      featureCheckWorker.terminate()
    }

    workerRef.current = new Worker()

    workerRef.current.onmessage = (e) => {
      console.log("Detected Barcodes", e.data)
      onScan(e.data)
    }

    const intervalId = setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && !disabled) {
        const bitmap = await createImageBitmap(videoRef.current)
        const sendable = await bitmapToSendable(bitmap)

        if (!sendable) return

        const bitmapOrImageDataArray = [sendable[0]]
        const transfer = [sendable[1]]

        const message = { bitmapOrImageDataArray }
        workerRef.current.postMessage(message, transfer)
      }
    }, scanDelay)

    return async () => {
      clearInterval(intervalId)
      workerRef.current.terminate()
    }
  }, [])

  const { width, height } = dimensions
  const aspectRatio = new Fraction(width, height)

  const videoStyles = {
    maxWidth: "100%",
    maxHeight: "100%",
    transform: facingMode === "user" ? "scaleX(-1)" : "none",
  }

  const margin = "4px"
  const cursor = disabled ? "default" : "pointer"
  const color = disabled ? "gray" : "#00bfff"
  const color2 = disabled ? "gray" : "#ffff00cf"

  async function createImageBitmapSafely(file) {
    if (!window.createImageBitmap) return null

    try {
      return await createImageBitmap(file)
    } catch (error) {
      return null
    }
  }

  async function handleSelectedFiles(fileList) {
    const files = Array.from(fileList)
    console.log("Selected Files", files)

    const images = files.filter((f) => f.type.startsWith("image/"))
    console.log("Selected Images", images)

    const notSupportedFiles = []

    const sendables = await Promise.all(
      images.map(async (image) => {
        const bitmap = await createImageBitmapSafely(image)
        if (!bitmap) {
          notSupportedFiles.push(image)
          return
        }
        return await bitmapToSendable(bitmap)
      }),
    )

    console.log("Not Supported Files", notSupportedFiles)

    const trueSendables = sendables.filter((s) => s)

    const bitmapOrImageDataArray = trueSendables.map((s) => s[0])
    const transfer = trueSendables.map((s) => s[1])

    const message = { bitmapOrImageDataArray, allwaysAnswer: true }
    workerRef.current.postMessage(message, transfer)
  }

  return (
    <>
      <input
        type="file"
        ref={inputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleSelectedFiles(e.target.files)}
      />
      {haveVideoDevices === true && (
        <div
          className="no-margin"
          style={{ width: "100dvw", height: "100dvh", background: "black" }}
        >
          <div
            style={{
              display: "flex",
              height: "100dvh",
              background: "black",
              justifyContent: "center",
            }}
          >
            <Camera
              info={info}
              setInfo={setInfo}
              torch={torch}
              setTorch={setTorch}
              devices={devices}
              setDevices={setDevices}
              deviceId={deviceId}
              setDeviceId={setDeviceId}
              disabled={disabled}
              setDisabled={setDisabled}
              videoRef={videoRef}
              style={videoStyles}
              onPlay={(e) => {
                const { videoWidth, videoHeight } = e.target
                if (videoWidth && videoHeight) {
                  setDimensions({ width: videoWidth, height: videoHeight })
                }
              }}
            />
          </div>
          <div
            style={{
              inset: 0,
              height: "100dvh",
              position: "absolute",
              alignContent: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                margin: "auto",
                maxWidth: "100%",
                maxHeight: "100%",
                aspectRatio: aspectRatio.toFraction(),
              }}
              onClick={() => setStats((s) => !s)}
              onDrop={(e) => {
                e.preventDefault()
                handleSelectedFiles(e.dataTransfer.files)
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <div
                className="whitespace-nowrap"
                style={{
                  color: "white",
                  background: "#000",
                  position: "absolute",
                  fontFamily: "serif",
                  display: deviceId && stats ? "block" : "none",
                }}
                onClick={(e) => e.stopPropagation()}
                onClickCapture={(e) => {
                  if (disabled) e.stopPropagation()
                }}
              >
                <div>
                  <div style={{ margin }}>Facing mode: {facingMode}</div>
                  <div style={{ margin }}>
                    Device: {cleanDeviceName(currentDevice?.label)}
                  </div>
                  <div style={{ margin }}>
                    Width: {width} Height: {height} Ratio:{" "}
                    {aspectRatio.toFraction()}
                  </div>
                  {isTorchAvailable && (
                    <div
                      onClick={() => setTorch((prev) => !prev)}
                      style={{ cursor, margin, color: color2 }}
                    >
                      {torch ? "Turn off" : "Turn on"} torch
                    </div>
                  )}
                  <div
                    onClick={() => {
                      if (disabled && !workerRef.current) return
                      inputRef.current.value = null
                      inputRef.current.click()
                    }}
                    style={{ color, cursor, margin }}
                  >
                    Scan from Image
                  </div>
                  {devices?.length > 1 && (
                    <div style={{ margin, gap: "6px", display: "flex" }}>
                      <div
                        onClick={() => setChangingDevice(true)}
                        style={{
                          color: changingDevice ? "#fff" : color,
                          cursor: changingDevice ? "default" : cursor,
                        }}
                      >
                        Change Video Device
                      </div>
                      {changingDevice && (
                        <div
                          onClick={() => setChangingDevice(false)}
                          style={{ color, cursor }}
                        >
                          Cancel
                        </div>
                      )}
                    </div>
                  )}
                  {changingDevice && (
                    <ul style={{ margin, paddingInlineStart: "16px" }}>
                      {devices
                        .filter((device) => device.deviceId !== deviceId)
                        .map((device) => (
                          <li
                            key={device.deviceId}
                            onClick={() => {
                              setChangingDevice(false)
                              setDeviceId(device.deviceId)
                            }}
                            style={{ color, cursor, margin }}
                          >
                            {cleanDeviceName(device.label)}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
              <div
                style={{
                  width: "100%",
                  color: "white",
                  minHeight: "3px",
                  textAlign: "center",
                  position: "relative",
                  background: "#026735",
                  animation: deviceId
                    ? "slide 6s ease-in-out infinite alternate"
                    : "none",
                }}
              >
                {!deviceId && "Give camera access and reload"}
              </div>
            </div>
          </div>
        </div>
      )}
      {haveVideoDevices === false && (
        <div>
          No video devices found{" "}
          <button
            onClick={() => {
              if (!workerRef.current) return
              inputRef.current.value = null
              inputRef.current.click()
            }}
          >
            Scan from Image
          </button>
        </div>
      )}
    </>
  )
}
