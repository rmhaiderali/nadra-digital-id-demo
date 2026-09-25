import ms from "ms"

const dayMs = ms("1d")

export function dateToUnixDay(date) {
  return Math.floor(date.getTime() / dayMs)
}

export function unixDayToDate(unixDay) {
  return new Date(unixDay * dayMs)
}

export function range(start, end, step = 1) {
  const result = []
  for (let i = start; i <= end; i += step) result.push(i)
  return result
}

export function chunkArray(arr, size) {
  const result = []

  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }

  return result
}

export function passwordRangeToString(range) {
  const start = range[0]
  const end = range.at(-1)
  const formattedStart = start.toString().padStart(4, "0")
  const formattedEnd = end.toString().padStart(4, "0")
  return formattedStart + " - " + formattedEnd
}

export function isValidBase64(str) {
  try {
    // throw new Error("Invalid Base64")
    return btoa(atob(str)) === str
  } catch (err) {
    return false
  }
}
