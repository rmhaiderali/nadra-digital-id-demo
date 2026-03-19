import "webrtc-adapter"
import { useEffect, useState, useRef } from "react"
import { Fraction } from "fraction.js"
import Worker from "./worker.js?worker"

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
  const streamRef = useRef(null)
  const [disabled, setDisabled] = useState(false)
  const [facingMode, setFacingMode] = useState("environment")
  const [orientation, setOrientation] = useState(screen.orientation)
  const [stats, setStats] = useState(false)
  const [torch, setTorch] = useState(false)

  const currentDevice = devices?.[currentDeviceIndex]

  const isTorchAvailable = currentDevice?.info[0].torch

  const isRotatedSideways = orientation.angle % 180 !== 0

  const isLensAndDeviceOrientationSame = orientation.type.startsWith(
    isRotatedSideways ? "portrait" : "landscape",
  )

  // console.log({
  //   orientation,
  //   isRotatedSideways,
  //   isLensAndDeviceOrientationSame,
  // })

  const width = currentDevice?.info[0].width
  const height = currentDevice?.info[0].height

  const doesDimensionsExist = [width, height].every(Number.isFinite)

  const [swapedWidth, swapedHeight] = isLensAndDeviceOrientationSame
    ? [width, height]
    : [height, width]

  const small = Math.min(width, height)
  const divisor = small / Math.min(1000, small)

  const [scaledWidth, scaledHeight] = doesDimensionsExist
    ? [width / divisor, height / divisor].map(Math.round)
    : []

  const [scaledSwapedWidth, scaledSwapedHeight] = isLensAndDeviceOrientationSame
    ? [scaledWidth, scaledHeight]
    : [scaledHeight, scaledWidth]

  // console.log({
  //   small,
  //   divisor,
  //   width,
  //   height,
  //   swapedWidth,
  //   swapedHeight,
  //   scaledWidth,
  //   scaledHeight,
  //   scaledSwapedWidth,
  //   scaledSwapedHeight,
  // })

  const swapedAspectRatio = new Fraction(swapedWidth, swapedHeight).toFraction()

  const scaledSwapedAspectRatio = new Fraction(
    scaledSwapedWidth,
    scaledSwapedHeight,
  ).toFraction()

  // console.log({ swapedAspectRatio, scaledSwapedAspectRatio })

  useEffect(() => {
    const handleChange = (event) => {
      setOrientation(event.target)
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

    const worker = new Worker()

    worker.onmessage = (e) => onScan(e.data)

    const intervalId = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState === 4)
        createImageBitmap(videoRef.current).then((bitmap) => {
          worker.postMessage(bitmap, [bitmap])
        })
    }, scanDelay)

    return async () => {
      clearInterval(intervalId)
      worker.terminate()
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
        currentDevice.info[0].facingMode
          ? Array.isArray(currentDevice.info[0].facingMode)
            ? currentDevice.info[0].facingMode[0]
            : currentDevice.info[0].facingMode
          : currentDevice.device.label.match(/front|user|Integrated Webcam/i)
            ? "user"
            : "environment",
      )

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          streamRef.current.removeTrack(track)
          track.stop()
        }
        await wait(delay)
      }

      const options = {
        audio: false,
        video: {
          torch,
          resizeMode: "none",
          width: scaledWidth,
          height: scaledHeight,
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

  return (
    <div>
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
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            // rotate: -orientation.angle + "deg",
            transform: facingMode === "user" ? "scaleX(-1)" : "none",
          }}
        />
      </div>
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
            margin: "auto",
            maxWidth: "100%",
            maxHeight: "100%",
            aspectRatio: scaledSwapedAspectRatio,
          }}
          onClick={() => setStats((s) => !s)}
        >
          <div
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
                Width: {scaledSwapedWidth}, Height: {scaledSwapedHeight}, Ratio:{" "}
                {swapedAspectRatio}
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
