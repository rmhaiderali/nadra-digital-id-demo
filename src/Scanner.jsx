import "webrtc-adapter"
import { useEffect, useState, useRef } from "react"
import { Fraction } from "fraction.js"
import Worker from "./worker.js?worker"

screen.orientation ??= {
  angle: 0,
  addEventListener: () => {},
  removeEventListener: () => {},
}

function getTrackInfo(track) {
  const c = track.getCapabilities()
  return {
    torch: c.torch,
    width: c.width.max,
    height: c.height.max,
    deviceId: c.deviceId,
    facingMode: c.facingMode,
  }
}

export default function Scanner({
  devices,
  setDevices,
  currentDeviceIndex,
  setCurrentDeviceIndex,
  onScan = () => {},
  scanDelay = 500,
}) {
  const videoRef = useRef(null)
  const inputRef = useRef(null)
  const streamRef = useRef(null)
  const workerRef = useRef(null)
  const [stats, setStats] = useState(false)
  const [torch, setTorch] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [dimensions, setDimensions] = useState({})
  const [facingMode, setFacingMode] = useState("environment")
  const [orientation, setOrientation] = useState(screen.orientation)

  const currentDevice = devices?.[currentDeviceIndex]

  const isTorchAvailable = currentDevice?.info[0].torch

  const isRotatedSideways = orientation.angle % 180 !== 0

  useEffect(() => {
    const handleChange = async (event) => {
      setOrientation(event.target)
      if (videoRef.current) {
        await wait(100)
        const { videoWidth, videoHeight } = videoRef.current
        if (videoWidth && videoHeight) {
          setDimensions({ width: videoWidth, height: videoHeight })
        }
      }
    }

    screen.orientation.addEventListener("change", handleChange)

    return () => {
      screen.orientation.removeEventListener("change", handleChange)
    }
  }, [])

  function wait(time) {
    setDisabled(true)
    return new Promise(function (resolve) {
      setTimeout(() => {
        resolve()
        setDisabled(false)
      }, time)
    })
  }

  const delay = 300

  useEffect(() => {
    const initialize = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { resizeMode: "none", facingMode: "environment" },
      })

      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((d) => d.kind === "videoinput")

      const devicesWithInfo = videoDevices.map((device) => ({ device }))

      const initialDeviceInfo = stream.getVideoTracks().map(getTrackInfo)
      const initialDeviceId = initialDeviceInfo[0].deviceId

      for (const track of stream.getTracks()) {
        stream.removeTrack(track)
        track.stop()
      }
      await wait(delay)

      for (const deviceWithInfo of devicesWithInfo) {
        if (deviceWithInfo.device.deviceId === initialDeviceId) {
          deviceWithInfo.info = initialDeviceInfo
          continue
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            resizeMode: "none",
            deviceId: deviceWithInfo.device.deviceId,
          },
        })

        deviceWithInfo.info = stream.getVideoTracks().map(getTrackInfo)

        for (const track of stream.getTracks()) {
          stream.removeTrack(track)
          track.stop()
        }
        await wait(delay)
      }

      setDevices(devicesWithInfo)

      const indexOfInitialDevice = devicesWithInfo.findIndex(
        (d) => d.device.deviceId === initialDeviceId,
      )

      setCurrentDeviceIndex(indexOfInitialDevice)
    }

    if (!devices && !currentDeviceIndex) initialize()

    workerRef.current = new Worker()

    workerRef.current.onmessage = (e) => onScan(e.data)

    const intervalId = setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && !disabled) {
        try {
          const bitmap = await createImageBitmap(videoRef.current)
          workerRef.current.postMessage(bitmap, [bitmap])
        } catch (e) {
          console.log(e)
        }
      }
    }, scanDelay)

    return async () => {
      clearInterval(intervalId)
      workerRef.current.terminate()
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
        await wait(delay)
      }
    }
  }, [])

  useEffect(() => {
    async function changeStream() {
      videoRef.current.srcObject = null

      setFacingMode(
        (Array.isArray(currentDevice.info[0].facingMode)
          ? currentDevice.info[0].facingMode[0]
          : currentDevice.info[0].facingMode) ??
          (/front|user|Integrated Webcam/i.test(currentDevice.device.label)
            ? "user"
            : "environment"),
      )

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          streamRef.current.removeTrack(track)
          track.stop()
        }
        await wait(delay)
      }

      const w = currentDevice.info[0].width
      const h = currentDevice.info[0].height

      const small = Math.min(w, h)
      const divisor = small / Math.min(1000, small)

      const width = Math.round(w / divisor)
      const height = Math.round(h / divisor)

      const options = {
        audio: false,
        video: {
          torch,
          width,
          height,
          resizeMode: "none",
          deviceId: currentDevice.device.deviceId,
        },
      }

      // console.log("Starting camera with options", options)

      const stream = await navigator.mediaDevices.getUserMedia(options)

      streamRef.current = stream
      videoRef.current.srcObject = stream
    }

    if (videoRef.current && currentDevice) changeStream()
  }, [videoRef, currentDevice, torch])

  const isFirefox = /Firefox/i.test(navigator.userAgent)
  const isAndroid = /Android/i.test(navigator.userAgent)

  const [width, height] =
    isFirefox && isAndroid && isRotatedSideways
      ? [dimensions.height, dimensions.width]
      : [dimensions.width, dimensions.height]

  const aspectRatio = new Fraction(width, height)

  const manualRotationStyle =
    isFirefox && isAndroid
      ? {
          rotate: -orientation.angle + "deg",
          scale: isRotatedSideways ? aspectRatio.valueOf() : 1,
        }
      : {}

  const videoStyles = {
    maxWidth: "100%",
    maxHeight: "100%",
    transform: facingMode === "user" ? "scaleX(-1)" : "none",
  }

  return (
    <div>
      <input
        type="file"
        ref={inputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files[0]
          if (!file && !workerRef.current) return
          const bitmap = await createImageBitmap(file)
          workerRef.current.postMessage(bitmap, [bitmap])
        }}
      />
      <div
        style={{
          display: "flex",
          height: "100dvh",
          background: "black",
          justifyContent: "center",
        }}
      >
        <video
          muted
          autoPlay
          playsInline
          // controls
          ref={videoRef}
          style={Object.assign(videoStyles, manualRotationStyle)}
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
        >
          <div
            className="whitespace-nowrap"
            style={{
              color: "white",
              background: "#000",
              position: "absolute",
              fontFamily: "serif",
              display: currentDevice && stats ? "block" : "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div style={{ margin: "4px" }}>Facing mode: {facingMode}</div>
              <div style={{ margin: "4px" }}>
                Device: {currentDevice?.device.label}
              </div>
              <div style={{ margin: "4px" }}>
                Width: {width}, Height: {height}, Ratio:{" "}
                {aspectRatio.toFraction()}
              </div>
              <div
                onClick={() => {
                  if (disabled && !workerRef.current) return
                  inputRef.current.value = null
                  inputRef.current.click()
                }}
                style={{
                  margin: "4px",
                  cursor: "pointer",
                  color: disabled ? "gray" : "#00bfff",
                }}
              >
                Scan from Image
              </div>
              {devices?.length > 1 && (
                <div
                  onClick={() => {
                    if (disabled) return
                    setCurrentDeviceIndex((prev) => (prev + 1) % devices.length)
                  }}
                  style={{
                    margin: "4px",
                    cursor: "pointer",
                    color: disabled ? "gray" : "#00bfff",
                  }}
                >
                  {"Change to "}
                  {
                    devices?.[(currentDeviceIndex + 1) % devices.length]?.device
                      .label
                  }
                </div>
              )}
              {isTorchAvailable && (
                <div
                  onClick={() => {
                    if (disabled) return
                    setTorch((prev) => !prev)
                  }}
                  style={{
                    margin: "4px",
                    cursor: "pointer",
                    color: disabled ? "gray" : "#ffff00cf",
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
              animation: currentDevice
                ? "slide 6s ease-in-out infinite alternate"
                : "none",
            }}
          >
            {!currentDevice && "Give camera access and reload"}
          </div>
        </div>
      </div>
    </div>
  )
}
