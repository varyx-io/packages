# @varyx-io/realm-config

The VarYX Identity Platform's **RealmConfig** contract: the TypeScript types
and validation for what an ID Product supplies to instantiate an Identity
Realm.

- `RealmConfig` and its parts: the type an ID Product writes its realm in
  (`satisfies RealmConfig`).
- `validateRealmConfig(realm)`: internal consistency (issuer/origin, passkey
  RP ID, hostnames in the zone, unique and well-formed registrations). Throws
  one `RealmConfigError` naming every problem.
- `parseRealmConfig(json)`: the same for configuration arriving as data,
  after a strict structural check. The platform uses it where an ID Product
  supplies its realm.

This package is **only the contract**: no realm (no product's values) and no
deployable infrastructure. Consumers don't need the rest of the Identity
Platform.

## Using it

```sh
npm install --save-exact @varyx-io/realm-config
```

```ts
import { validateRealmConfig, type RealmConfig } from "@varyx-io/realm-config";

export const REALM = validateRealmConfig({ /* … */ } as const satisfies RealmConfig);
```

No registry configuration or token is needed: it's a public package on
npmjs.com. Pin an exact version.

## Developing

```sh
npm ci
npm run typecheck
npm test        # the contract's behaviour, against a neutral fixture realm
npm run build   # dist/: CommonJS + .d.ts
```

## Releasing

Bump `version` in `package.json` by pull request. After it merges, tag the
merge commit:

```sh
git tag identity/node/realm-config/v<version>
git push origin identity/node/realm-config/v<version>
```

The tag runs [`identity-node-realm-config.yml`](../../../.github/workflows/identity-node-realm-config.yml),
which checks that the tag matches `package.json`, builds, tests, and
publishes to npm with provenance, through npm trusted publishing (no stored
token). A published version is never republished or changed.

## History

The source moved here from the private Identity Platform repository
(`varyx-io/identity`, `packages/node/realm-config`) on 2026-10-08. Earlier
commits were replayed with their authors and dates; each names its original
in a `Migrated-from:` trailer. Before 0.1.0 of this name, the same contract
was published privately as `@varyx-io/identity-realm-config` 0.1.0.
