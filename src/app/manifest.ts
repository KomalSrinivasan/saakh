import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Saakh",
    short_name: "Saakh",
    description: "KCC loan appraisal assistant for cooperative bank field officers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#0e4d3a",
    lang: "en-IN",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      { src: "/screenshots/phone-cases.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Case list with the step-by-step explainer" },
      { src: "/screenshots/phone-capture.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Land record capture" },
      { src: "/screenshots/desktop-cases.png", sizes: "1440x900", type: "image/png", form_factor: "wide", label: "Case console on desktop" },
    ],
  };
}
