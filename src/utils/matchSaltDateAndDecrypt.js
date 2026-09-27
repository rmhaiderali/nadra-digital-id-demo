import { DateTime } from "luxon"
import nadraDigitalId from "nadra-digital-id"
import matchPin from "./matchPin.js"
import {
  isValidBase64,
  dateToUnixDay,
  unixDayToDate,
} from "./commonFunctions.js"

export default async function matchSaltDateAndDecrypt(decodedData, pin, date) {
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

  if (!isValidBase64(decodedData.vc)) {
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

    const { date, vc } = decodedData

    const { data: decryptedDate } = nadraDigitalId.decrypt(date, pin, time)

    const { data: decryptedVC } = nadraDigitalId.decrypt(vc, pin, time)

    try {
      return {
        data: {
          salt: time,
          date: new Date(decryptedDate + "Z"),
          vc: JSON.parse(decryptedVC),
        },
      }
    } catch (e) {}
  }

  return { notfound: true }
}
