# Install and connect

amoCRM and Kommo keep your deals, contacts and companies in the cloud, and an AI agent has no way to read them or
update a deal for you. After this page, `amo` is installed and signed in to your account, and you or your agent can
read and change the CRM from a terminal, from a script or over MCP. `amo` is a WireCat command-line tool: a program
you run by typing its name in a terminal. It changes your account only as far as the permissions you set allow.

You connect `amo` once per account. An account administrator makes one private integration in amoCRM or Kommo, and
both ways of signing in use it: a key that you paste, or a sign-in in the browser.

**On this page:**

1. [Install](#install)
2. [Create the integration](#create-the-integration)
3. [Sign in with a key](#sign-in-with-a-key)
4. [Sign in through the integration](#sign-in-through-the-integration)
5. [Which one to choose](#which-one-to-choose)
6. [Connect in WireCat Desktop](#connect-in-wirecat-desktop)
7. [Sign out and revoke access](#sign-out-and-revoke-access)
8. [Next: the first sync](#next-the-first-sync)

## Install

Install `amo` once on each computer where you or an agent use it. You need Node.js 22.16 or a later 22.x, or 24 or
later; Node 23 is not supported.

```sh
npm install -g @wirecat/amo-cli
amo --version
amo doctor
```

`amo doctor` needs no network and opens no keyring. It shows the version, where settings live, the profiles that
exist, and whether other users of the computer can read the settings.

WireCat Desktop will install `amo` for you once amoCRM is in its catalog; that comes with the next Desktop release.

## Create the integration

An account administrator does this once. The same integration serves the key and the browser sign-in.

<!-- TODO screenshots, when the files exist:
  src/setup/assets/01-amomarket-menu.png (the ⋯ menu in амоМаркет)
  src/setup/assets/02-integration-form.png (the integration form) -->

In amoCRM (`<subdomain>.amocrm.ru`):

1. Open **амоМаркет**, click **⋯** at the top left and choose **«Создать интеграцию»**.
2. Give it a name and a description, such as *WireCat*.
3. In **«Ссылка для перенаправления»** (the Redirect URI), enter `https://wirecat.dev/webhooks/apps/amo-callback`.
   The key does not use it, but with it the same integration also works for the browser sign-in.
4. Under **«Предоставить доступ»**, tick **«Доступ к данным аккаунта»**.
5. Leave **«Контроль дублей»** and **«Множественные источники»** unticked, and save.

On an account that is not marked technical, amoCRM first asks you to sign a waiver of technical support for a private
integration. After that, amoCRM support no longer takes reports of system errors on the account, and the waiver
cannot be taken back. Read it before you sign
([amoCRM: integrations](https://www.amocrm.ru/developers/content/integrations/intro),
[amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step)).

In Kommo (`<subdomain>.kommo.com` or `<subdomain>.amocrm.com`): Settings → Integrations → **Create integration**. Fill
in the name, the description and the same **Redirect URL**. **Allow access** has every scope ticked by default; leave
**Duplicate control** and **Multiple sources** unticked, and save. Kommo asks for no waiver
([Kommo: private integration](https://developers.kommo.com/docs/private-integration)).

## Sign in with a key

The key is amoCRM's long-lived token. It acts with the rights of the administrator who made it.

<!-- TODO screenshots, when the files exist:
  src/setup/assets/03-keys-tab.png (the «Ключи» tab)
  src/setup/assets/04-generate-token.png (the end date and the token) -->

1. In the integration, open the **«Ключи»** tab (Kommo: **Keys and scopes**) and click **«Сгенерировать токен»**
   (Kommo: **Generate long-lived token**).
2. Pick an end date, from one day to five years.
3. Copy the token. It is shown only once
   ([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step),
   [Kommo: long-lived token](https://developers.kommo.com/docs/long-lived-token)).
4. Choose a profile name for this account, such as `work`, give the account's address, and paste the token when
   `amo` asks:

   ```sh
   amo work session start --host https://example.amocrm.ru
   amo work session status --check
   ```

`session start` reads the token without showing it, or from stdin. It checks the token against the account, and only
then keeps it in the system keyring with the address; `--credential-storage file` keeps it in a private file instead.
`session status --check` shows the account and the user the token acts as. The address stays as you give it:
`<subdomain>.amocrm.ru`, `<subdomain>.kommo.com` or `<subdomain>.amocrm.com`.

## Sign in through the integration

This sign-in uses OAuth: you allow the integration in the browser, and each person acts with their own rights.

1. On the integration's **«Ключи»** tab (Kommo: **Keys and scopes**), copy the integration ID. Keep the secret key
   open too.
2. Run, with your address and ID:

   ```sh
   amo work session start --host https://example.amocrm.ru --client-id <integration ID>
   ```

3. Paste the secret key when `amo` asks; it is not shown. `AMO_AMOCRM_CLIENT_SECRET` can give it instead.
4. The browser opens amoCRM. Choose the account and click **«Разрешить»** (Allow).

`amo` keeps the tokens and renews the access token itself. The integration's Redirect URI must be
`https://wirecat.dev/webhooks/apps/amo-callback`. A new sign-in of either kind replaces the profile's other one.

## Which one to choose

- **The key** is the simplest: one paste and no browser. It acts as the administrator who made it, and stops on its
  end date. Then you make a new one and run `session start` again.
- **The integration sign-in** acts as the person who signs in, and has no end date to watch. amoCRM's refresh token
  lasts 3 months, and `amo` gets a new one each time it renews the access token. So it keeps working while `amo` runs
  at least once in 3 months; after a longer pause, sign in again
  ([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step)).

## Connect in WireCat Desktop

This comes with the next Desktop release, once amoCRM is in its catalog. Desktop then asks the questions `amo` itself
describes, so they match the terminal:

1. **Which account?** The address you open the CRM at.
2. **Create a private integration.** The steps of [create the integration](#create-the-integration).
3. **Make the token.** Paste the key from the «Ключи» tab.
4. **Checking the token.** `amo` asks the account who the token belongs to, and saves the address and the token only
   if the account answers. A refused token takes you back to the token step.
5. **Connected.** The profile is ready.

Desktop signs in with the key. The browser sign-in is the terminal command shown under **Advanced** on the last step.

## Sign out and revoke access

`amo work session end` forgets the sign-in on this computer. `amo work account remove --keep-data` forgets the
profile's sign-in and files; `--delete-data` also deletes the account's copy from the WireCat store.

Neither tells amoCRM. To stop a key on the account itself, for example after a leak, open the integration's
**«Выданные доступы»** tab and click **«Отозвать доступ»**
([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step)). In Kommo it is the
**Authorization** tab → **Revoke access** ([Kommo: long-lived token](https://developers.kommo.com/docs/long-lived-token)).

## Next: the first sync

Copy your deals and their clients into WireCat, then list the open ones:

```sh
amo work sync
amo work deals list status:open
```

More in [the first sync](usage.md#the-first-sync).
