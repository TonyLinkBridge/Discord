import type { TrackingInput } from "./admin-data/types";

const isRayNameHost = (hostname: string) =>
  hostname === "rayname.com" || hostname.endsWith(".rayname.com");

export function buildTrackedRayNameUrl(input: TrackingInput): string {
  const url = new URL(input.destination);

  if (url.protocol !== "https:" || !isRayNameHost(url.hostname)) {
    throw new Error("Tracking destinations must use HTTPS on a RayName domain.");
  }

  const parameters = new URLSearchParams(url.search);
  parameters.set("utm_campaign", input.campaign);
  parameters.set("utm_content", input.content);
  parameters.set("utm_medium", input.medium);
  parameters.set("utm_source", input.source);
  parameters.sort();
  url.search = parameters.toString();

  return url.toString();
}
