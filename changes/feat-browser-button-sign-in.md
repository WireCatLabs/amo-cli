### Added

- **Sign in with one click: `amo <profile> session start --host https://<subdomain>.amocrm.ru --one-click`.** The
  browser opens amoCRM's button on wirecat.dev. The person chooses the account and clicks «Разрешить», and amoCRM
  creates a WireCat integration in it. Nobody copies an integration ID, a secret key or a token. amoCRM sends the
  integration's secret key to wirecat.dev, and `amo` collects it once. `amo` exchanges the code only with the account
  `--host` names, and refuses one allowed in another account. It keeps and renews the sign-in like `--client-id`.
  amoCRM lets only an account administrator allow it ([amoCRM: the button](https://www.amocrm.ru/developers/content/oauth/button)).
  amoCRM accounts only for now; Kommo signs in with a token.
- **`amo setup` offers «Войти через amoCRM» first to an administrator,** with the token second. WireCat Desktop shows
  the link to open, and waits until access is allowed.
