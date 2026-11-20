# Install and connect

Connect your amoCRM or Kommo account once, and from then on your AI agent can read and update your deals. The CRM keeps
your deals, contacts and companies in the cloud, and it lets a program in only through a private integration that an
account administrator makes.

Your agent then answers which deals are open, moves a deal to the next stage or finds a client, from a terminal or over
MCP, as far as the permissions you set allow. You run the same commands yourself, or from a script.

`amo` is a WireCat command-line tool, a program you or your agent run by its name. You connect it once per account,
and `amo work setup` asks each question in turn. An administrator of an amoCRM account signs in with one click in the
browser and copies nothing. A token you paste works too, and is the way for Kommo and for users who are not
administrators. Not an administrator yourself? Ask one for a key, as
[if you are not an administrator](#if-you-are-not-an-administrator) shows.

**On this page:**

1. [Install](#install)
2. [Sign in with amoCRM](#sign-in-with-amocrm)
3. [Create the integration](#create-the-integration)
4. [Sign in with a key](#sign-in-with-a-key)
5. [Sign in through the integration](#sign-in-through-the-integration)
6. [Which one to choose](#which-one-to-choose)
7. [If you are not an administrator](#if-you-are-not-an-administrator)
8. [Connect step by step](#connect-step-by-step)
9. [Connect in WireCat Desktop](#connect-in-wirecat-desktop)
10. [Sign out and revoke access](#sign-out-and-revoke-access)
11. [Next: the first sync](#next-the-first-sync)

## Install

Install `amo` once on each computer where you or an agent use it. You need Node.js 22.16 or a later 22.x, or 24 or
later. Node 23 is not supported.

```sh
npm install -g @wirecat/amo-cli
amo --version
amo skill install   # the agent skill, for Claude Code, Codex, Gemini CLI and OpenClaw
amo doctor
```

An agent with no terminal, such as Claude Desktop, uses `amo` over [MCP](mcp.md) instead. `amo doctor` needs no
network and opens no keyring. It shows the version, where settings live, the profiles that exist, and whether other
users of the computer can read the settings.

## Sign in with amoCRM

One click in the browser, with nothing to copy. It works for amoCRM accounts at `<subdomain>.amocrm.ru`. Kommo
accounts sign in with a key for now.

```sh
amo work session start --host https://example.amocrm.ru --one-click
```

1. The browser opens a WireCat page with amoCRM's button. Click it.
2. Choose the account and click **«Разрешить»** (Allow).
3. amoCRM creates a WireCat integration in the account. `amo` checks which account and user it got, and saves the
   sign-in in the system keyring.

What happens behind the click:

- amoCRM lets only an account administrator allow this
  ([amoCRM: the button](https://www.amocrm.ru/developers/content/oauth/button)). The integration then shows in
  амоМаркет, where an administrator can switch it off.
- amoCRM sends the new integration's secret key to wirecat.dev. `amo` collects it from there once, and wirecat.dev
  keeps no copy.
- `amo` exchanges the code only with the account you named in `--host`. If you chose another account in amoCRM's
  window, it stops and names that account.
- You act with your own rights, and `amo` renews the sign-in itself, as with
  [the integration sign-in](#sign-in-through-the-integration).

## Create the integration

An account administrator does this once, for the key or for a sign-in through an integration of your own. The one-click
sign-in above needs none.

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
in the name, the description and the same **Redirect URL**. **Allow access** has every scope ticked by default. Leave
**Duplicate control** and **Multiple sources** unticked, and save. Kommo asks for no waiver
([Kommo: private integration](https://developers.kommo.com/docs/private-integration)).

## Sign in with a key

The key is amoCRM's long-lived token. It acts with the rights of the administrator who made it.

1. In the integration, open the **«Ключи»** tab (Kommo: **Keys and scopes**) and click **«Сгенерировать токен»**
   (Kommo: **Generate long-lived token**).
2. Pick an end date, from one day to five years.
3. Copy the token. It is shown only once
   ([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step),
   [Kommo: long-lived token](https://developers.kommo.com/docs/long-lived-token)).
4. Choose a profile name for this account, such as `work`. Run the commands below with your account's address in
   place of the example `https://example.amocrm.ru`, and paste the token when `amo` asks:

   ```sh
   amo work session start --host https://example.amocrm.ru
   amo work session status --check
   ```

`session start` reads the token without showing it, or from stdin. It checks the token against the account, and only
then keeps it in the system keyring with the address. `--credential-storage file` keeps it in a private file instead.
`session status --check` shows the account and the user the token acts as. The address stays as you give it:
`<subdomain>.amocrm.ru`, `<subdomain>.kommo.com` or `<subdomain>.amocrm.com`.

## Sign in through the integration

This sign-in uses OAuth: you allow the integration in the browser, and act with your own rights. amoCRM offers only
the accounts where you are an administrator
([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step)).

1. On the integration's **«Ключи»** tab (Kommo: **Keys and scopes**), copy the integration ID. Keep the secret key
   open too.
2. Run the command below with your own address and integration ID in place of the examples
   `https://example.amocrm.ru` and `0123abcd-4567-89ef-0123-456789abcdef`:

   ```sh
   amo work session start --host https://example.amocrm.ru --client-id 0123abcd-4567-89ef-0123-456789abcdef
   ```

3. Paste the secret key when `amo` asks. It is not shown. `AMO_AMOCRM_CLIENT_SECRET` can give it instead.
4. The browser opens amoCRM. Choose the account and click **«Разрешить»** (Allow).

`amo` keeps the tokens and renews the access token itself. The integration's Redirect URI must be
`https://wirecat.dev/webhooks/apps/amo-callback`. A new sign-in of either kind replaces the profile's other one.

## Which one to choose

- **Sign in with amoCRM** is the quickest: one click, no integration to create and nothing to copy. It needs an
  administrator of an amoCRM account. It acts as that person, and `amo` renews it like the integration sign-in below.
- **The key** works for Kommo and for users who are not administrators: one paste and no browser. It acts as the
  administrator who made it, and stops on its end date. Then you make a new one and run `session start` again.
- **The integration sign-in** uses an integration you made yourself. It acts as the administrator who signs in, and
  has no end date to watch. amoCRM's refresh token lasts 3 months, and `amo` gets a new one each time it renews the
  access token. So it keeps working while `amo` runs at least once in 3 months. After a longer pause, sign in again
  ([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step)).

## If you are not an administrator

You can tell by the menu on the left in amoCRM: without **амоМаркет** there, you are not an administrator. Only an
administrator can create the integration and its key, and the browser sign-in offers only accounts where you are one. So
you connect with a key an administrator makes for you:

1. Send an administrator of your account the link to this page, and ask for a private integration and its long-lived
   token.
2. The administrator follows [create the integration](#create-the-integration) and [sign in with a key](#sign-in-with-a-key),
   and passes you the key. The key works like a password: pass it through a password manager, not a group chat.
3. Run `amo work setup`, answer **No, I am a user**, and paste the key.

The key acts with the administrator's rights: you see and can change what the administrator can. amo's permissions
still limit what an agent changes. A sync first copies the administrator's deals, so choose your own as
[which deals sync copies](configuration.md#which-deals-sync-copies) shows.

## Connect step by step

`amo work setup` asks the questions one at a time, checks the answers and saves them only when the check passes:

1. **Which account?** The address you open the CRM at.
2. **Are you an administrator of this account?** An administrator chooses how to sign in. A user gets the request
   to send an administrator, as in [if you are not an administrator](#if-you-are-not-an-administrator).
3. **How do you want to sign in?** **Sign in with amoCRM** goes to the browser, as in
   [sign in with amoCRM](#sign-in-with-amocrm), and then to the last step. **With a long-lived token** goes on below.
4. **Create a private integration.** The steps of [create the integration](#create-the-integration).
5. **Make the token.** Paste the key from the «Ключи» tab, or the key the administrator sent you.
6. **Checking the token.** `amo` asks the account who the token belongs to, and saves the address and the token only
   if the account answers. A refused token takes you back to the token step.
7. **Connected.** The profile is ready. A user who is not an administrator also sees how to choose their own deals.

A sign-in through an integration of your own is the command shown under **Advanced** on the last step.

## Connect in WireCat Desktop

[WireCat Desktop](https://wirecat.dev/en/docs/desktop) installs `amo` from its Tools page, from version
0.7.1. Its window asks the same questions as `amo work setup`, because `amo` describes them, and checks the token the
same way before it saves anything. **Sign in with amoCRM** shows a link to open in the browser, and the window waits
until you allow access. A sign-in through an integration of your own is the command under **Advanced** on the last
step.

## Sign out and revoke access

`amo work session end` forgets the sign-in on this computer. `amo work account remove --keep-data` forgets the
profile's sign-in and files, and `--delete-data` also deletes the account's copy from the WireCat store.

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
