import type { TrackingInput } from "./admin-data/types";

const isRayNameHost = (hostname: string) =>
  hostname === "rayname.com" || hostname.endsWith(".rayname.com");

type RayNameDestinationFailure = "credentials" | "invalid";

function inspectRayNameDestination(destination: string):
  | { failure: RayNameDestinationFailure; url: null }
  | { failure: null; url: URL } {
  try {
    const url = new URL(destination);
    if (url.protocol !== "https:" || !isRayNameHost(url.hostname)) {
      return { failure: "invalid", url: null };
    }
    if (url.username || url.password) {
      return { failure: "credentials", url: null };
    }
    return { failure: null, url };
  } catch {
    return { failure: "invalid", url: null };
  }
}

export function rayNameDestinationError(destination: string): string | null {
  const { failure } = inspectRayNameDestination(destination);
  if (failure === "credentials") return "Use an HTTPS RayName destination without credentials";
  if (failure === "invalid") return "Use an HTTPS RayName destination";
  return null;
}

export function buildTrackedRayNameUrl(input: TrackingInput): string {
  const { failure, url } = inspectRayNameDestination(input.destination);

  if (failure || !url) {
    const credentialSuffix = failure === "credentials" ? " without credentials" : "";
    throw new Error(`Tracking destinations must use HTTPS on a RayName domain${credentialSuffix}.`);
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
