# @varyx-io/realm-config

The Identity Platform's **RealmConfig** contract: the TypeScript types and
validation for what an ID Product supplies to instantiate an Identity Realm
(identity/docs ADRs 0015, 0018, 0020, 0023).

- `RealmConfig` and its parts: the type an ID Product writes its realm in
  (`satisfies RealmConfig`).
- `validateRealmConfig(realm)`: internal consistency (issuer/origin, passkey
  RP ID, hostnames in the zone, unique and well-formed registrations). Throws
  one `RealmConfigError` naming every problem.
- `parseRealmConfig(json)`: the same for configuration arriving as data,
  after a strict structural check. The platform uses it where an ID Product
  supplies its realm (`REALM_CONFIG_FILE`).

This package is **only the contract**: no realm (no product's values) and no
deployable infrastructure. It is independently consumable: consumers don't
need the rest of the Identity Platform (ADR 0023).

## Building

```sh
npm ci
npm run build   # dist/: CommonJS + .d.ts
```

Its behaviour is tested with the realm inputs in this repository's
`realm/` (see `provider/infra/test/realm-config.test.ts`).

## Distribution

Not yet decided (ADR 0023: registry, access, versioning). Its predecessor,
`@varyx-io/identity-realm-config` 0.1.0, was published to GitLab's package
registry from GitLab identity/web; VarYX ID still pins that artifact until
distribution is decided. The contract source is unchanged.
