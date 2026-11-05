const prefix = "nadra-digital-id-demo:"

export function getItem(key) {
  return localStorage.getItem(prefix + key)
}

export function setItem(key, value) {
  return localStorage.setItem(prefix + key, value)
}

export function removeItem(key) {
  return localStorage.removeItem(prefix + key)
}

export default { getItem, setItem, removeItem }
