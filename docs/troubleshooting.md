# When something goes wrong

Get `amo` working again from the message it shows. A token that expired, a profile left out of the command and an
amoCRM account that stopped answering each have their own message and their own fix.

You find your symptom in the table, run the check it gives, and retry the command. If it still fails, you have the
error code and the profile name ready for a support request. Your agent can do the same: each error names its reason,
such as `session.expired`, so it knows what happened.

`amo doctor` shows what is set up without the network or the keyring. `amo work session status --check` asks the
account which user the sign-in acts as.

**On this page:**

1. [First checks](#first-checks)
2. [Symptoms and what to do](#symptoms-and-what-to-do)
3. [Asking for help](#asking-for-help)

## First checks

```sh
amo doctor                         # the version, the settings, the profiles, without the network
amo work session status --check    # the account and the user the sign-in acts as
amo work store status              # how far each kind's sync is, and when it last ran
```

## Symptoms and what to do

| Symptom | What to do |
| --- | --- |
| Not sure what is set up | Run `amo doctor`. It reads no keyring and uses no network. |
| `amo` is not found | Open a new terminal, and check that npm's global folder is on `PATH`. |
| "name a profile" | Put the profile first, as in `amo work config show`, or set `AMO_PROFILE`. |
| The settings file does not read | `doctor` lists every problem in the file under `config.issues`. Run the `config unset` each one gives, or fix the file by hand. |
| `doctor` lists `files.problems` | Other users of the computer can read `config.json` or enter its folder. Run each `chmod` that `doctor` prints after "to make it private:". `doctor` never changes a file mode itself. |
| "not signed in" (`session.missing`) | Run `amo work setup`, or `amo work session start --host` with the account's address, as [install and connect](installation.md#sign-in-with-a-key) shows. |
| "amoCRM refused the token" (`session.expired`) | The long-lived token expired or was revoked, or `--host` names another account. Make a new token and run `amo work session start` again with the account's address, as [install and connect](installation.md#sign-in-with-a-key) shows. |
| The browser sign-in stopped working | `amo` went unused for more than 3 months and amoCRM's refresh token expired. Sign in again, as [sign in through the integration](installation.md#sign-in-through-the-integration) shows. |
| "another profile here already signs in to this account as this user" (`session.duplicate`) | Use that profile, or remove it with `amo <profile> account remove --keep-data` and sign in again. |
| The sync copies someone else's deals, or not all of yours | A sync copies the deals of the user who signed in, or of the users an administrator chose. Find ids with `users list`, then set them as [which deals sync copies](configuration.md#which-deals-sync-copies) shows. |
| A contact or company is not in the copy | The copy keeps only the clients on your deals. Read any other one live with `people list` or `organizations list`. |
| "the account has no API filter add-on" (`amo.filters-off`) | A live list of contacts or companies filters by owner or time only with amoCRM's paid API filter add-on. Search by words instead, such as `amo work people list "Anna"`. |
| No more phones and e-mails today (`crm.foreign-contacts-spent`) | A user who is not an administrator sees those of at most 100 other contacts and companies a day. The count starts again the next day (UTC). |
| "the token's user may not do this in amoCRM" (`amo.access-denied`) | amoCRM's own rights refuse it. An administrator gives that user the right in amoCRM, or an administrator signs in to the profile instead. |
| "only an amoCRM administrator …" (`employee.delete`, `employee.clear`, `employee.unbind`) | Deleting, setting a field to nothing and unlinking records need an administrator's sign-in. See [permissions](permissions.md#checks-that-hold-whatever-the-permissions-say). |
| `rate_limited` (exit 8) | `amo` keeps to 5 requests a second and waits out a short refusal by itself. Wait a minute and run the command once more. |
| `outcome_unknown` (exit 14) on a write | amoCRM may have made the change. Run `sync`, look at the record with `show`, and write it again only if the change is not there. |
| "the amoCRM subscription has ended" (`amo.subscription-ended`) | Renew the subscription in amoCRM. Writes stop at once, and reads 30 days later. |
| "amoCRM blocks every request" (`amo.blocked`) | Stop every `amo` command on the account and check it in amoCRM: too many requests, or an address not on its allow list. |
| A write is refused | The profile's permissions or `AMO_READ_ONLY` stop it. See [permissions](permissions.md). |

## Asking for help

Keep the error code and the profile name. `amo doctor reports create` writes a problem report to a file and says where
to send it. Ask on [Discord](https://discord.gg/DebENqbRrJ), or open an issue in the
[amo-cli repository](https://github.com/WireCatLabs/amo-cli/issues).

Never paste a token, a password or private content into a support request.
