export type PlanCode = 'trial' | 'silver' | 'gold';

export const DAILY_SCREENSHOT_LIMITS: Record<PlanCode, number> = {
  trial: 20,
  silver: 50,
  gold: 80,
};

export const DAILY_OCR_LIMITS: Record<PlanCode, number> = {
  trial: 20,
  silver: 50,
  gold: 80,
};

export function normalizePlanCode(plan?: string | null): PlanCode {
  const code = (plan || 'trial').toLowerCase();
  if (code === 'silver' || code === 'gold') {
    return code;
  }
  return 'trial';
}

export function getDailyScreenshotLimit(plan?: string | null): number {
  return DAILY_SCREENSHOT_LIMITS[normalizePlanCode(plan)];
}

export function getDailyOcrLimit(plan?: string | null): number {
  return DAILY_OCR_LIMITS[normalizePlanCode(plan)];
}

export function buildCountQuota(
  dailyLimit: number,
  usedToday: number,
  planAllows: boolean,
) {
  const remainingToday = Math.max(0, dailyLimit - usedToday);
  return {
    allowed: planAllows && remainingToday > 0,
    dailyLimit,
    usedToday,
    remainingToday,
  };
}
