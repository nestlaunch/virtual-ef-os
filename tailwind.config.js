/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        osbg: "#13263b",
        panel: "#0f1f2f",
        accent: "#58a6ff",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      boxShadow: {
        app: "0 16px 48px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
