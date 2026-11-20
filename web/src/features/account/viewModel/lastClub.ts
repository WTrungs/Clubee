const LAST_CLUB_KEY = 'clubee.lastClubId'

/** CLB làm việc gần nhất, để header vẫn hiện tên CLB khi đang ở trang cá nhân (FR-ACC-06). Chỉ là mã CLB, không nhạy cảm. */
export function readLastClubId(): string | null {
  try {
    return localStorage.getItem(LAST_CLUB_KEY)
  } catch {
    return null
  }
}

export function rememberLastClubId(clubId: string): void {
  try {
    localStorage.setItem(LAST_CLUB_KEY, clubId)
  } catch {
    // Storage may be blocked; the switcher then falls back to the first club.
  }
}
