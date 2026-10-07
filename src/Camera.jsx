import { useEffect, useRef } from "react"

function stopStreamTracks(stream) {
  for (const track of stream.getTracks()) track.stop()
}

function getTrackInfo(track) {
  const c = track.getCapabilities?.()

  if (c)
    return {
      torch: !!c.torch,
      width: c.width.max,
      height: c.height.max,
      deviceId: c.deviceId,
      facingMode: c.facingMode?.[0],
    }

  const s = track.getSettings?.()

  return {
    torch: false,
    width: s.width,
    height: s.height,
    deviceId: s.deviceId,
    facingMode: s.facingMode,
  }
}

export default function App({
  info,
  setInfo,
  torch,
  setTorch,
  devices,
  setDevices,
  deviceId,
  setDeviceId,
  disabled,
  setDisabled,
  videoRef,
  ...props
}) {
  const streamRef = useRef(null)

  useEffect(() => {
    if (info?.deviceId === deviceId) return

    setDisabled(true)

    if (streamRef.current) {
      videoRef.current.srcObject = null
      stopStreamTracks(streamRef.current)
      streamRef.current = null
    }

    let cancelled = false

    async function startCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          torch,
          width: 9999,
          height: 9999,
          resizeMode: "none",
          ...(deviceId ? { deviceId } : { facingMode: "environment" }),
        },
      })

      if (cancelled) {
        stopStreamTracks(stream)
        return
      }

      const firstTrack = stream.getVideoTracks()[0]
      const info = getTrackInfo(firstTrack)

      const w = info.width
      const h = info.height

      const small = Math.min(w, h)
      const divisor = small / Math.min(1000, small)

      const width = Math.round(w / divisor)
      const height = Math.round(h / divisor)

      await firstTrack.applyConstraints({ width, height, resizeMode: "none" })
      const updatedInfo = getTrackInfo(firstTrack)

      setInfo(updatedInfo)
      setDeviceId(updatedInfo.deviceId)

      streamRef.current = stream
      videoRef.current.srcObject = stream

      setDisabled(false)

      if (!devices.length) {
        const newDevices = await navigator.mediaDevices.enumerateDevices()
        setDevices(newDevices.filter((d) => d.kind === "videoinput"))
      }
    }

    startCamera()

    return () => {
      cancelled = true
    }
  }, [deviceId])

  useEffect(() => {
    if (!streamRef.current || !info?.torch) return
    async function updateTorch() {
      const firstTrack = streamRef.current.getVideoTracks()[0]
      await firstTrack.applyConstraints({
        advanced: [{ torch }],
        width: { exact: info.width },
        height: { exact: info.height },
      })
    }
    updateTorch()
  }, [torch, streamRef.current])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        stopStreamTracks(streamRef.current)
        streamRef.current = null
      }
    }
  }, [])

  return (
    // <>
    <video ref={videoRef} muted autoPlay playsInline {...props}></video>
    //   <br />
    //   <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
    //     {devices.map((device) => (
    //       <option key={device.deviceId} value={device.deviceId}>
    //         {device.label}
    //       </option>
    //     ))}
    //   </select>
    // </>
  )
}
