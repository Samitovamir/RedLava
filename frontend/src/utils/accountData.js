// Local data belongs to the ACCOUNT, not to the browser.
//
// Why: there is one localStorage per device. Sign out of one account on a phone and into
// another, and the first account's data is still lying there for the second person to see.
// Worse, the background sync would then push somebody else's data into HIS OWN slot on the
// server (pullSync doesn't wipe local data while the new account's server side is still empty).
//
// So we keep a marker next to the data recording whose it is. On sign-in we compare: a
// different account means erasing the personal keys before the app starts, after which
// pullSync fetches this account owner's data from the server. The data itself stays IN
// localStorage — the PWA's offline mode rests on it, and moving it all server-side would break that.

const OWNER_TAG = 'albert-data-owner'

// Personal data: erased when the account changes.
const PERSONAL_PREFIXES = ['albert-', 'ai-sum']
// The exceptions, which are NOT personal: the sign-in, the device identifier and the
// device's own settings (theme, layout, language). No reason to lose those with the account.
const KEEP = new Set([
  // who signed in: the token, the role, the account's id/login/rights
  'albert-auth', 'albert-role', 'albert-user-id', 'albert-username',
  // the device and its settings
  'albert-device', 'albert-theme', 'albert-theme-mobile', 'albert-layout',
  OWNER_TAG,
])

const isPersonal = (key) => !KEEP.has(key) && PERSONAL_PREFIXES.some(p => key.startsWith(p))

export function wipePersonalData() {
  try {
    Object.keys(localStorage).filter(isPersonal).forEach(k => localStorage.removeItem(k))
  } catch { /* private mode — not critical */ }
}

/*
  Compare whose data is sitting in the browser with whoever is signed in right now.
  accountKey is a stable identifier for the account: the userId of an ordinary
  account, or the 'guest' role (the demo has no id of its own).
  Returns true if the data had to be erased.
*/
export function claimLocalData(accountKey) {
  if (!accountKey) return false
  try {
    const previous = localStorage.getItem(OWNER_TAG)
    if (previous === accountKey) return false
    if (previous) wipePersonalData()      // another account's data — this one doesn't get to see it
    localStorage.setItem(OWNER_TAG, accountKey)
    return !!previous
  } catch { return false }
}
