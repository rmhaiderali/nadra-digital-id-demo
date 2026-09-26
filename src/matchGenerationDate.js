import { DateTime } from "luxon"
import nadraDigitalId from "nadra-digital-id"
import matchPin from "./matchPin.js"
import { isValidBase64, dateToUnixDay, unixDayToDate } from "./utils.js"

export default async function matchGenerationDate(decodedData, pin, date) {
  const { match: matchedPin, error: matchPinError } = await matchPin(
    decodedData,
    pin,
  )

  if (matchPinError) {
    return { error: matchPinError }
  }

  if (!matchedPin) {
    return { error: "Wrong PIN" }
  }

  const vc = decodedData.vc

  if (!isValidBase64(vc)) {
    return { error: "VC is not a valid Base64 string" }
  }

  const unixDay = dateToUnixDay(date)

  const dateToCrack = DateTime.fromJSDate(unixDayToDate(unixDay), {
    zone: "utc",
  }).setZone("Asia/Karachi", { keepLocalTime: true })

  const { data: timeValues, error: timeRangeError } = nadraDigitalId.timeRange({
    bounds: {
      start: dateToCrack.toJSDate(),
      end: dateToCrack.endOf("day").toJSDate(),
    },
  })

  if (timeRangeError) {
    return { error: "Failed to calculate time range" }
  }

  // console.log("Time Range", timeValues)

  for (const time of timeValues) {
    // wait a tick to update the UI with the new range being tried
    await new Promise((resolve) => setTimeout(resolve, 0))

    const { data: decryptedData } = nadraDigitalId.decrypt(vc, pin, time)

    if (decryptedData) {
      try {
        return { data: { date: time, vc: JSON.parse(decryptedData) } }
      } catch (e) {}
    }
  }

  return { notfound: true }
}
