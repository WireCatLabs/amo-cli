### Added

- **`amo setup` asks whether you are an account administrator.** An administrator creates the integration as before.
  A user who is not one gets the request to send an administrator for a long-lived token, a warning that the token
  carries the administrator's rights, and, once connected, how to sync their own deals rather than the administrator's.
  WireCat Desktop shows the same steps. The installation page has the same path under "If you are not an
  administrator".

### Fixed

- The setup and the installation page no longer say that anyone can sign in through the integration in the browser:
  amoCRM's guide says it offers that sign-in only on accounts where the person is an administrator
  (https://www.amocrm.ru/developers/content/oauth/step-by-step).
