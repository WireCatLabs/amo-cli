# When something goes wrong

Start with the symptom, run the check, then retry the command. Keep the error code and the profile name for a
support request.

| Symptom | What to do |
| --- | --- |
| Not sure what is set up | Run `amo doctor`. It reads no keyring and uses no network. |
| `amo` is not found | Open a new terminal, and check that npm's global folder is on `PATH`. |
| "name a profile" | Put the profile first, as in `amo work config show`, or set `AMO_PROFILE`. |
| The settings file does not read | `doctor` lists every problem in the file under `config.issues`. Run the `config unset` each one gives, or fix the file by hand. |
| `doctor` lists `files.problems` | Other users of the computer can read `config.json` or enter its folder. Run each `chmod` that `doctor` prints after "to make it private:". `doctor` never changes a file mode itself. |
| "amoCRM refused the token" (`session.expired`) | The long-lived token expired or was revoked, or `--host` names another account. Make a new token and run `amo work session start --host <address>`. |
| "the amoCRM subscription has ended" (`amo.subscription-ended`) | Renew the subscription in amoCRM; reads stop 30 days after writes. |
| "amoCRM blocks every request" (`amo.blocked`) | Stop every `amo` command on the account and check it in amoCRM: too many requests, or an address not on its allow list. |
| A write is refused | The profile's permissions or `AMO_READ_ONLY` stop it; see [settings](configuration.md#permissions). |

Never paste a token, a password or private content into a support request.
