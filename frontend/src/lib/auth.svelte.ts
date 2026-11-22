class Session {
  /**
   * True when Steerarr's login is on and this device isn't logged in (or its login expired).
   * Set by `api` when the backend answers `login_required`; App then shows the login form.
   */
  loginRequired = $state(false);
}

export const session = new Session();
