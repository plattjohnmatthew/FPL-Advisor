# Security

Private mode is a single-user local application without authentication. Bind it to `127.0.0.1`; never expose private mode to the internet, a shared LAN or a tunnel. It can spend your provider credits and mutate your database. Use a dedicated Supabase project and keep all keys in ignored local configuration.

Only `APP_MODE=public_read_only` is intended for anonymous hosting. Use the documented public build, credential-free snapshot access and server capability guards. Never configure paid API credentials, operational Supabase credentials or the Blob write token on that deployment. See [the public-release security report](docs/PUBLIC_RELEASE_SECURITY_REPORT.md).

Do not include credentials, private transcripts or database exports in issues, pull requests, screenshots or logs. For a vulnerability, use GitHub's **Security → Report a vulnerability** when private reporting is enabled. If unavailable, open an issue asking the maintainer for a private reporting channel without publishing exploit details or sensitive data. Rotate exposed credentials promptly; deleting a file or changing repository visibility does not revoke a key.

Before source publication, run `npm run audit:repository`. This checks reachable fetched Git history and candidate source files without printing matched secrets. It does not inspect GitHub-hosted Actions logs, issues, releases or hidden pull-request refs, and cannot prove every possible secret absent. Review those account surfaces separately before making a private repository public.
