export const orderSpeeds = { low: 1350, medium: 900, high: 550 } as const;
export type OrderSpeed = keyof typeof orderSpeeds;
export const saveIntervals = [10, 30, 60] as const;
export const replayRates = [0.5, 1, 1.5, 2, 3] as const;
export type ReplayRate = (typeof replayRates)[number];

const key = "stolen-ages.preferences";

export interface Preferences {
  orderSpeed: OrderSpeed;
  savesEnabled: boolean;
  autosave: boolean;
  interval: (typeof saveIntervals)[number];
}

export function readPreferences(): Preferences {
  const defaults: Preferences = {
    orderSpeed: "medium",
    savesEnabled: false,
    autosave: false,
    interval: 30,
  };
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? "null",
    ) as Partial<Preferences> | null;
    if (!stored) return defaults;
    return {
      orderSpeed:
        stored.orderSpeed && Object.hasOwn(orderSpeeds, stored.orderSpeed)
          ? stored.orderSpeed
          : defaults.orderSpeed,
      savesEnabled: stored.savesEnabled === true,
      autosave: stored.autosave === true,
      interval:
        saveIntervals.find((value) => value === stored.interval) ??
        defaults.interval,
    };
  } catch {
    return defaults;
  }
}

export function writePreferences(preferences: Preferences) {
  localStorage.setItem(key, JSON.stringify(preferences));
}
