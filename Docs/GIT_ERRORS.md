# Git error messages

Git failures appear in the existing notification system and retained transfer results with a short explanation. **Technical details** expands the complete diagnostic. **Copy** and manual feedback reports include those details with credentials redacted.

| Problem                                             | Follow-up action                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing or unusable Git / Git LFS                   | Open the existing tool manager to review installation or recheck availability.                                                                                                                                                    |
| Remote authentication or access denied              | Open the account used by that endpoint. SSH and system credentials lead to remote configuration instead. Verify permissions and the remote URL as well as sign-in.                                                                |
| Network, certificate or server errors               | **Verify connection again** checks that exact endpoint using its selected credentials. It does not fetch, pull, push, or change local refs. A successful check verifies read access; push permissions still depend on the server. |
| Merge conflicts                                     | **Open conflict** reads fresh Git status and opens a file that remains unresolved.                                                                                                                                                |
| Missing author identity                             | Open the commit identity dialog. Hosting credentials do not replace Git name and email.                                                                                                                                           |
| Local modifications, diverged history, or Git locks | Open the workspace and address the stated prerequisite before retrying. Locks are not deleted automatically.                                                                                                                      |
| Unavailable local repository                        | Open the saved repository list and use location recovery or recheck.                                                                                                                                                              |

Follow-up actions retain the failed operation's repository, endpoint and account context. Changes to that context require a fresh action. Multi-target push results keep their individual explanations and the existing targeted retry workflow; successful targets are preserved.

Unrelated application errors keep their own messages. Already helpful selection or secret-scan instructions remain visible. Cancelled Git operations use expiring informational notifications.
