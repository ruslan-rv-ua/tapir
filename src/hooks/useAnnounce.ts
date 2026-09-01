import { announce } from "../stores/announcer";

export function useAnnounce(): typeof announce {
  // Module function, stable identity — safe in dependency arrays.
  return announce;
}
