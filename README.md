# varyx-io/packages

The source of VarYX's **independently distributed packages**: software that
other repositories and other organizations install as a versioned
dependency. Each package's source lives here and only here; this repository
is not a mirror of anything.

The name says what the repository holds, not who can see it. It's public
because the packages in it are published publicly. The products and
platforms that produce them stay private (identity/docs ADR 0024).

## Layout

Packages are grouped by the VarYX capability that produces them, then by
ecosystem, then by package:

```text
<capability>/<ecosystem>/<package>/
```

| Package | Source | Published as |
|---|---|---|
| RealmConfig: the Identity Platform's realm configuration contract | [`identity/node/realm-config/`](identity/node/realm-config) | [`@varyx-io/realm-config`](https://www.npmjs.com/package/@varyx-io/realm-config) on npm |

A directory is added when a package exists, never ahead of one.

## What belongs here

A package belongs here when it is **consumed as a versioned artifact outside
the repository that produces the capability**: a contract, a library, an SDK
or a Go module that an ID Product, an application or another organization
installs.

These don't:
- **products and services** (VarYX ID, the Identity Platform's Provider and
  API): they are deployed, not installed;
- **deployable platform releases** (such as the Identity Platform release
  that composes a realm): versioned with the platform, from its repository;
- **anything with a product's configuration in it.** A package never holds a
  product's realm, accounts, hostnames or registrations.

## Distribution

Each ecosystem publishes the way its consumers expect. One repository
doesn't mean one registry.

- **Node:** public packages on npmjs.com under the `@varyx-io` scope. They
  install with no token or registry configuration. Each is published from
  GitHub Actions by npm trusted publishing (OIDC, no stored token), with
  provenance.
- **Go** (when a Go package exists): a module per package, with module path
  `github.com/varyx-io/packages/<capability>/go/<package>` and tags
  `<capability>/go/<package>/vX.Y.Z`, fetched through the Go module proxy.
  No registry.

## Releasing

Every package has its own version and its own workflow
(`.github/workflows/<capability>-<ecosystem>-<package>.yml`). A release is a
tag named after the package's directory:

```text
<capability>/<ecosystem>/<package>/v<semver>     e.g. identity/node/realm-config/v0.1.0
```

That is Go's own tag convention for a module in a subdirectory, used for
every ecosystem. A tag publishes only a commit already on `main`; the
package's README says how.

## Repository

Managed by the VarYX SCM control plane (`varyx-io/platform`, `scm/`): its
settings and default-branch protection are declared there. Changes reach
`main` by pull request.
