"use client";
import { SpeedInsights } from "@vercel/speed-insights/next"

import PalCutGame from "./palcut/page";

export default function Home() {
  return (
    <div style={{ fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif` }}>
      <SpeedInsights />
      <PalCutGame />
    </div>
  );
}
