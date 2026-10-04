# @varyx-io/identity-realm-config

The Identity Platform's **RealmConfig** contract: the TypeScript types and
validation for what an ID Product supplies to instantiate an Identity Realm
(identity/docs ADRs 0015, 0018, 0020).

- `RealmConfig` and its parts: the type an ID Product writes its realm in
  (`satisfies RealmConfig`).
- `validateRealmConfig(realm)`: internal consistency (issuer/origin, passkey
  RP ID, hostnames in the zone, unique and well-formed registrations). Throws
  one `RealmConfigError` naming every problem.
- `parseRealmConfig(json)`: the same for configuration arriving as data,
  after a strict structural check. The platform uses it where an ID Product
  supplies its realm (`REALM_CONFIG_FILE`).

This package is **only the contract**. It contains no realm (no product's
values) and no deployable infrastructure. The platform's deployable release
(`IdentityRealm`, ADR 0017) is later work and will depend on this.

## Releasing

The source of truth is `src/index.ts` in this directory. identity/auth and
identity/api carry byte-identical mirrors, pinned by SHA-256 in their
`infra/test/realm-config.test.ts`: update the pins there in the same change.

1. Bump `version` in `package.json`.
2. Merge to `main`.
3. Tag the merge commit `realm-config-v<version>` and push the tag.

CI (`publish:realm-config`) builds the package and publishes it to this
project's GitLab package registry with the job's own token. Consumers
install it with read access to that registry. In CI that's their job token,
allowed by this project's job-token allowlist.
