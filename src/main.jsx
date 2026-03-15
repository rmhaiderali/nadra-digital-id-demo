import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { ToastContainer } from "react-toastify"
import App from "./App.jsx"
import "./index.css"

// function ToastContainerWithColorScheme() {
//   const [isDarkMode, setIsDarkMode] = useState(
//     () => window.matchMedia("(prefers-color-scheme: dark)").matches,
//   )

//   useEffect(() => {
//     const updateMode = (e) => setIsDarkMode(e.matches)

//     window
//       .matchMedia("(prefers-color-scheme: dark)")
//       .addEventListener("change", updateMode)

//     return () =>
//       window
//         .matchMedia("(prefers-color-scheme: dark)")
//         .removeEventListener("change", updateMode)
//   }, [])

//   return <ToastContainer theme={isDarkMode ? "dark" : "light"} />
// }

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <ToastContainer />
  </StrictMode>,
)
