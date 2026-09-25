import { DateTime } from "luxon"
import nadraDigitalId from "nadra-digital-id"
import getHashFunctionByVersion from "./getHashFunctionByVersion.js"
import { isValidBase64, range, dateToUnixDay, unixDayToDate } from "./utils.js"

export default async function crackGenerationDate(
  start,
  end,
  pin,
  dateFormat,
  decodedData,
  crackingGenerationDateRange = {},
  crackingGenerationDateStatus = {},
) {
  const { data: hashFunction, error: hashFunctionError } =
    getHashFunctionByVersion(decodedData.v)

  if (hashFunctionError) {
    return { error: hashFunctionError }
  }

  const { data: pinHash, error: pinHashError } = hashFunction.fn(pin)

  if (pinHashError) {
    return { error: "Failed to hash PIN" }
  }

  if (decodedData.hash !== pinHash) {
    return { error: "Wrong PIN" }
  }

  const vc = decodedData.vc

  if (!isValidBase64(vc)) {
    return { error: "VC is not a valid Base64 string" }
  }

  crackingGenerationDateStatus.value = "cracking"

  const startUnixDay = dateToUnixDay(start)
  const endUnixDay = dateToUnixDay(end)

  let error = false
  let crackedVC = null
  let crackedDate = null

  main: for (const unixDay of range(startUnixDay, endUnixDay)) {
    const dateToCrack = DateTime.fromJSDate(unixDayToDate(unixDay), {
      zone: "utc",
    }).setZone("Asia/Karachi", { keepLocalTime: true })

    crackingGenerationDateRange.value = dateToCrack.toFormat(dateFormat)

    const { data: timeValues, error: timeRangeError } =
      nadraDigitalId.timeRange({
        bounds: {
          start: dateToCrack.toJSDate(),
          end: dateToCrack.endOf("day").toJSDate(),
        },
      })

    if (timeRangeError) {
      error = "Failed to calculate time range"
      break main
    }

    // console.log("Time Range", timeValues)

    for (const time of timeValues) {
      // wait a tick to update the UI with the new range being tried
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (crackingGenerationDateStatus.value !== "cracking")
        return { aborted: true }

      const result = nadraDigitalId.decrypt(vc, pin, time)

      if (result.data) {
        try {
          crackedVC = JSON.parse(result.data)
          crackedDate = time
          break main
        } catch (e) {}
      }
    }
  }

  crackingGenerationDateRange.value = ""

  if (error) return { error }

  if (crackedVC) return { data: { date: crackedDate, vc: crackedVC } }

  return { notfound: true }
}
