/**
 * RealmConfig: what an ID Product supplies to instantiate an Identity Realm
 * from the Identity Platform (identity/docs ADR 0015).
 *
 * TRANSITIONAL SHARED FILE. Byte-identical copies live in identity/auth,
 * identity/api and identity/web (`infra/config/realm/realm-config.ts`).
 * Each repo's `infra/test/realm-config.test.ts` pins this file's SHA-256,
 * so a copy can't drift silently: change all three together. The copies
 * end when `auth` folds into `provider` (ADR 0017) and realm configuration
 * moves to the product's deploy repository (ADR 0018).
 *
 * Deliberately small: only what today's implementation consumes, plus the
 * realm's permanent public identity triple (issuer, authentication origin,
 * passkey RP ID), which an ID Product must decide before it can exist.
 */

/** Realm presentation: who is authenticating the user (not which application is asking; ADR 0014). */
export interface RealmBranding {
  /** The authority's name in copy: "Sign in to <name>", "your <name> account". Also a reserved name for applications. */
  readonly name: string;
  /** Page-title suffix and site name: "<page> · <siteTitle>". */
  readonly siteTitle: string;
}

/** An OAuth application: the consent-page identity of a relying party (ADR 0014). Validated fully by the Provider. */
export interface RealmApplication {
  readonly id: string;
  readonly displayName: string;
  readonly logo?: string;
  readonly homepage?: string;
  readonly privacyPolicyUrl?: string;
  readonly termsOfServiceUrl?: string;
}

/** An OAuth client of the realm's Provider: protocol configuration (ADR 0008). Validated fully by the Provider. */
export interface RealmOAuthClient {
  readonly id: string;
  readonly clientId: string;
  readonly applicationId: string;
  readonly name: string;
  readonly redirectUris: readonly string[];
  readonly postLogoutRedirectUris: readonly string[];
  readonly allowedScopes: readonly ("openid" | "profile" | "email")[];
  readonly clientType: "PUBLIC";
  readonly status: "ACTIVE" | "DISABLED";
  readonly firstParty: true;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RealmConfig {
  readonly product: {
    /** Slug, e.g. "varyx-id". */
    readonly id: string;
    /** The ID Product's name, e.g. "VarYX ID". */
    readonly displayName: string;
  };
  /** The realm's permanent public identity. */
  readonly identity: {
    /** Exactly the authentication origin today: the Provider derives its issuer from its origin. */
    readonly issuer: string;
    /** Where people authenticate and where the Provider is served: an https origin. */
    readonly authenticationOrigin: string;
    /** WebAuthn RP ID: the authentication host or a registrable parent. Recorded now, consumed when passkeys exist. */
    readonly passkeyRpId: string;
    /** Extra origins allowed to complete sign-in for local development of the Provider (loopback http only). */
    readonly developmentOrigins: readonly string[];
  };
  readonly branding: RealmBranding;
  /** Where the realm runs. The account itself is created by the organization platform (ADR 0018). */
  readonly aws: { readonly account: string; readonly region: string };
  /** The DNS zone the realm's hostnames live in. Its hosted-zone ID comes from the organization platform, at deploy time. */
  readonly dns: { readonly zoneName: string };
  readonly hostnames: {
    /** The realm's Identity API host. */
    readonly api: string;
  };
  /** The realm's Cognito User Pool and its domains. */
  readonly credentialAuthority: {
    /** Cognito custom domain (hosted UI, federation callback; ADR 0012). */
    readonly customDomain: string;
    /** Cognito prefix domain (`<prefix>.auth.<region>.amazoncognito.com`). */
    readonly domainPrefix: string;
  };
  readonly oauth: {
    /** `aud` of the realm's access tokens (ADR 0009). */
    readonly accessTokenAudience: string;
    readonly applications: readonly RealmApplication[];
    readonly clients: readonly RealmOAuthClient[];
  };
}

export class RealmConfigError extends Error {
  override readonly name = "RealmConfigError";
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** The host of an origin like `https://id.example.com`. */
export function hostOf(origin: string): string {
  return new URL(origin).hostname;
}

function isWithin(host: string, zone: string): boolean {
  return host === zone || host.endsWith(`.${zone}`);
}

function isLoopback(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

/** A canonical https origin: scheme + host (+ non-default port), nothing else, no trailing slash. */
function checkHttpsOrigin(name: string, value: string, problems: string[]): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${name} "${value}" is not a URL`);
    return;
  }
  if (url.protocol !== "https:") problems.push(`${name} "${value}" must use https`);
  if (url.origin !== value) problems.push(`${name} "${value}" must be a bare origin (no path, query, fragment or trailing slash), i.e. "${url.origin}"`);
  if (url.username || url.password) problems.push(`${name} must not contain userinfo`);
}

function checkRegisteredUri(name: string, value: string, problems: string[]): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${name} "${value}" is not an absolute URL`);
    return;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url))) problems.push(`${name} "${value}" must use https (http only for loopback)`);
  if (url.hash || value.includes("#")) problems.push(`${name} "${value}" must not contain a fragment`);
  if (value.includes("*")) problems.push(`${name} "${value}" must not contain a wildcard`);
}

function checkHostname(name: string, value: string, problems: string[]): void {
  if (!HOSTNAME.test(value)) problems.push(`${name} "${value}" is not a lower-case DNS hostname`);
}

/**
 * Validates a RealmConfig for internal consistency and returns it unchanged,
 * or throws one error naming every problem. Run at synth (before anything
 * deploys). The Provider additionally validates OAuth registrations in full
 * (src/lib/oauth/clients.ts, applications.ts).
 */
export function validateRealmConfig<T extends RealmConfig>(realm: T): T {
  const problems: string[] = [];
  const { product, identity, branding, aws, dns, hostnames, credentialAuthority, oauth } = realm;

  if (!SLUG.test(product.id)) problems.push(`product.id "${product.id}" must be a lower-case slug`);
  if (!product.displayName.trim()) problems.push("product.displayName is required");

  // Identity: the permanent public triple.
  checkHttpsOrigin("identity.issuer", identity.issuer, problems);
  checkHttpsOrigin("identity.authenticationOrigin", identity.authenticationOrigin, problems);
  if (identity.issuer !== identity.authenticationOrigin) {
    problems.push(
      `identity.issuer "${identity.issuer}" must equal identity.authenticationOrigin "${identity.authenticationOrigin}" (the Provider derives its issuer from its origin)`
    );
  }
  let authHost: string | undefined;
  try {
    authHost = hostOf(identity.authenticationOrigin);
  } catch {
    // reported above
  }
  if (authHost) {
    const rpId = identity.passkeyRpId;
    // HOSTNAME needs two or more labels, so a bare TLD is rejected here too.
    if (!HOSTNAME.test(rpId)) problems.push(`identity.passkeyRpId "${rpId}" is not a lower-case DNS hostname of two or more labels`);
    else if (!isWithin(authHost, rpId)) {
      problems.push(`identity.passkeyRpId "${rpId}" must be the authentication host "${authHost}" or a parent of it (WebAuthn §5.1.4)`);
    }
  }
  for (const origin of identity.developmentOrigins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" || !isLoopback(url) || url.origin !== origin) {
        problems.push(`identity.developmentOrigins "${origin}" must be a bare loopback http origin`);
      }
    } catch {
      problems.push(`identity.developmentOrigins "${origin}" is not a URL`);
    }
  }

  if (!branding.name.trim()) problems.push("branding.name is required");
  if (!branding.siteTitle.trim()) problems.push("branding.siteTitle is required");

  if (!/^\d{12}$/.test(aws.account)) problems.push(`aws.account "${aws.account}" must be a 12-digit AWS account ID`);
  if (!/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(aws.region)) problems.push(`aws.region "${aws.region}" is not an AWS region`);

  // Hostnames live in the realm's zone and are distinct.
  checkHostname("dns.zoneName", dns.zoneName, problems);
  checkHostname("hostnames.api", hostnames.api, problems);
  checkHostname("credentialAuthority.customDomain", credentialAuthority.customDomain, problems);
  const realmHosts: Array<[string, string | undefined]> = [
    ["authentication origin", authHost],
    ["hostnames.api", hostnames.api],
    ["credentialAuthority.customDomain", credentialAuthority.customDomain],
  ];
  for (const [name, host] of realmHosts) {
    if (host && !isWithin(host, dns.zoneName)) problems.push(`${name} "${host}" is not inside dns.zoneName "${dns.zoneName}"`);
  }
  const hostSet = realmHosts.map(([, h]) => h).filter((h): h is string => Boolean(h));
  if (new Set(hostSet).size !== hostSet.length) problems.push("the authentication, API and credential-authority hostnames must be distinct");
  if (!SLUG.test(credentialAuthority.domainPrefix)) problems.push(`credentialAuthority.domainPrefix "${credentialAuthority.domainPrefix}" must be a lower-case slug`);

  // OAuth registrations: identity and references.
  try {
    if (new URL(oauth.accessTokenAudience).protocol !== "https:") problems.push("oauth.accessTokenAudience must be an https URI");
  } catch {
    problems.push(`oauth.accessTokenAudience "${oauth.accessTokenAudience}" is not an absolute URI`);
  }
  const duplicates = (values: readonly string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
  for (const d of duplicates(oauth.applications.map((a) => a.id))) problems.push(`oauth.applications: duplicate id "${d}"`);
  for (const d of duplicates(oauth.clients.map((c) => c.id))) problems.push(`oauth.clients: duplicate id "${d}"`);
  for (const d of duplicates(oauth.clients.map((c) => c.clientId))) problems.push(`oauth.clients: duplicate clientId "${d}"`);
  const applicationIds = new Set(oauth.applications.map((a) => a.id));
  for (const client of oauth.clients) {
    if (!applicationIds.has(client.applicationId)) problems.push(`oauth.clients "${client.id}": unknown applicationId "${client.applicationId}"`);
    for (const uri of client.redirectUris) checkRegisteredUri(`oauth.clients "${client.id}" redirect URI`, uri, problems);
    for (const uri of client.postLogoutRedirectUris) checkRegisteredUri(`oauth.clients "${client.id}" post-logout URI`, uri, problems);
  }

  if (problems.length > 0) {
    throw new RealmConfigError(`RealmConfig "${product.id}" is invalid:\n` + problems.map((p) => `  - ${p}`).join("\n"));
  }
  return realm;
}
