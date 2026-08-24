const AUTO_LOGIN_PREFERENCE_KEY = "moonwords-auto-login";

const canUseBrowserStorage = () => typeof window !== "undefined";

export const isAutoLoginEnabled = () => {
  if (!canUseBrowserStorage()) return true;
  return window.localStorage.getItem(AUTO_LOGIN_PREFERENCE_KEY) !== "false";
};

export const setAutoLoginEnabled = (enabled: boolean) => {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(AUTO_LOGIN_PREFERENCE_KEY, enabled ? "true" : "false");
};

export const moonwordsAuthStorage = {
  getItem(key: string) {
    if (!canUseBrowserStorage()) return null;
    if (isAutoLoginEnabled()) {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    }
    return window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (!canUseBrowserStorage()) return;
    if (isAutoLoginEnabled()) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, value);
    window.localStorage.removeItem(key);
  },
  removeItem(key: string) {
    if (!canUseBrowserStorage()) return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
