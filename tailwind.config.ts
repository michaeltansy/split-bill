import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          primary: "#00AED6",
          "primary-hover": "#0098BC",
          "primary-soft": "#E5F7FB",
        },
        surface: {
          bg: "#F5F7FA",
          card: "#FFFFFF",
        },
        "text-primary": "#0A0A0A",
        "text-secondary": "#4A4A4A",
        "border-subtle": "#E5E7EB",
        status: {
          success: "#1BAE6A",
          danger: "#E5484D",
        },
      },
    },
  },
  plugins: [],
};

export default config;
