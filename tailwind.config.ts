import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        coinbase: {
          blue: "#0052FF",
          "blue-dark": "#0041CC",
          "blue-light": "#1652F0",
          background: "#FFFFFF",
          surface: "#F5F8FA",
          border: "#D8DCE6",
          text: "#050F19",
          "text-secondary": "#5B616E",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
