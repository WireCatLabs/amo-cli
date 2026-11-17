# When something goes wrong

Get `amo` working again from the message it shows. A token that expired, a profile left out of the command and an
amoCRM account that stopped answering each have their own message and their own fix.

Find your symptom in the table and run the check beside it. Your agent can do the same: each error names its reason,
such as `session.expired`, so it knows what happened. Start with `amo doctor`, which shows what is set up and needs
no network.

**On this page:**

1. [Symptoms and what to do](#symptoms-and-what-to-do)
2. [Asking for help](#asking-for-help)

## Symptoms and what to do

| Symptom | What to do |
| --- | --- |
| Not sure what is set up | Run `amo doctor`. It reads no keyring and uses no network. |
| `amo` is not found | Open a new terminal, and check that npm's global folder is on `PATH`. |
| "name a profile" | Put the profile first, as in `amo work config show`, or set `AMO_PROFILE`. |
| The settings file does not read | `doctor` lists every problem in the file under `config.issues`. Run the `config unset` each one gives, or fix the file by hand. |
| `doctor` lists `files.problems` | Other users of the computer can read `config.json` or enter its folder. Run each `chmod` that `doctor` prints after "to make it private:". `doctor` never changes a file mode itself. |
| "amoCRM refused the token" (`session.expired`) | The long-lived token expired or was revoked, or `--host` names another account. Make a new token and run `amo work session start` again with the account's address, as [install and connect](installation.md#sign-in-with-a-key) shows. |
| "the amoCRM subscription has ended" (`amo.subscription-ended`) | Renew the subscription in amoCRM. Writes stop at once, and reads 30 days later. |
| "amoCRM blocks every request" (`amo.blocked`) | Stop every `amo` command on the account and check it in amoCRM: too many requests, or an address not on its allow list. |
| A write is refused | The profile's permissions or `AMO_READ_ONLY` stop it, as [settings](configuration.md#permissions) shows. |

## Asking for help

Keep the error code and the profile name. `amo doctor reports create` writes a problem report to a file and says where
to send it. Ask on [Discord](https://discord.gg/DebENqbRrJ), or open an issue in the
[amo-cli repository](https://github.com/WireCatLabs/amo-cli/issues).

Never paste a token, a password or private content into a support request.
