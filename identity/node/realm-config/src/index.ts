/**
 * RealmConfig: what an ID Product supplies to instantiate an Identity Realm
 * from the Identity Platform (identity/docs ADRs 0015, 0018, 0020, 0023, 0024).
 *
 * The contract is owned by the Identity Platform. Its only source is this
 * directory (identity/node/realm-config of github.com/varyx-io/packages),
 * published to npm as `@varyx-io/realm-config`. ID Products, and the
 * platform itself, depend on that package, never on platform source.
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

/**
 * A relying party registered directly on the realm's Cognito User Pool
 * (Cognito's own OAuth surface). Legacy: retired once the application uses
 * the realm's Provider (ADR 0011). The client's CloudFormation logical ID is
 * derived from `clientIdOutput`, and its name from `name`: changing either
 * replaces the client and issues a new client ID.
 */
export interface RealmLegacyRelyingPartyClient {
  /** Short, stable slug: the Cognito client-name suffix. */
  readonly name: string;
  /** CloudFormation output carrying the client ID, e.g. "NotesClientId". */
  readonly clientIdOutput: string;
  readonly callbackUrls: readonly string[];
  readonly logoutUrls: readonly string[];
}

export interface RealmConfig {
  readonly product: {
    /** Slug, e.g. "example-id". */
    readonly id: string;
    /** The ID Product's name, e.g. "Example ID". */
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
    /** Applications still signing in through Cognito directly (legacy; ADR 0011). */
    readonly legacyRelyingPartyClients: readonly RealmLegacyRelyingPartyClient[];
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
  const duplicates = (values: readonly string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
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

  const legacy = credentialAuthority.legacyRelyingPartyClients;
  for (const d of duplicates(legacy.map((c) => c.name))) problems.push(`credentialAuthority.legacyRelyingPartyClients: duplicate name "${d}"`);
  for (const d of duplicates(legacy.map((c) => c.clientIdOutput))) {
    problems.push(`credentialAuthority.legacyRelyingPartyClients: duplicate clientIdOutput "${d}"`);
  }
  for (const client of legacy) {
    if (!SLUG.test(client.name)) problems.push(`credentialAuthority.legacyRelyingPartyClients "${client.name}": name must be a lower-case slug`);
    if (!/^[A-Z][A-Za-z0-9]{0,200}ClientId$/.test(client.clientIdOutput)) {
      problems.push(`credentialAuthority.legacyRelyingPartyClients "${client.name}": clientIdOutput must look like "NameClientId"`);
    }
    for (const uri of client.callbackUrls) checkRegisteredUri(`credentialAuthority.legacyRelyingPartyClients "${client.name}" callback URL`, uri, problems);
    for (const uri of client.logoutUrls) checkRegisteredUri(`credentialAuthority.legacyRelyingPartyClients "${client.name}" logout URL`, uri, problems);
  }

  // OAuth registrations: identity and references.
  try {
    if (new URL(oauth.accessTokenAudience).protocol !== "https:") problems.push("oauth.accessTokenAudience must be an https URI");
  } catch {
    problems.push(`oauth.accessTokenAudience "${oauth.accessTokenAudience}" is not an absolute URI`);
  }
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

// ---------------------------------------------------------------------------
// Supplied configuration: a RealmConfig arriving as JSON (from an ID
// Product's deployment) is untyped until checked. parseRealmConfig checks its
// structure strictly (no missing, mistyped or unknown fields), then validates
// it, and returns the parsed object itself so field order is preserved.

type Shape =
  | "string"
  | "true"
  | { readonly kind: "array"; readonly of: Shape }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "object"; readonly fields: Readonly<Record<string, Shape>>; readonly optional?: readonly string[] };

const str: Shape = "string";
const array = (of: Shape): Shape => ({ kind: "array", of });
const object = (fields: Record<string, Shape>, optional: string[] = []): Shape => ({ kind: "object", fields, optional });
const oneOf = (...values: string[]): Shape => ({ kind: "enum", values });

const REALM_SHAPE: Shape = object({
  product: object({ id: str, displayName: str }),
  identity: object({ issuer: str, authenticationOrigin: str, passkeyRpId: str, developmentOrigins: array(str) }),
  branding: object({ name: str, siteTitle: str }),
  aws: object({ account: str, region: str }),
  dns: object({ zoneName: str }),
  hostnames: object({ api: str }),
  credentialAuthority: object({
    customDomain: str,
    domainPrefix: str,
    legacyRelyingPartyClients: array(object({ name: str, clientIdOutput: str, callbackUrls: array(str), logoutUrls: array(str) })),
  }),
  oauth: object({
    accessTokenAudience: str,
    applications: array(
      object({ id: str, displayName: str, logo: str, homepage: str, privacyPolicyUrl: str, termsOfServiceUrl: str }, [
        "logo",
        "homepage",
        "privacyPolicyUrl",
        "termsOfServiceUrl",
      ])
    ),
    clients: array(
      object({
        id: str,
        clientId: str,
        applicationId: str,
        name: str,
        redirectUris: array(str),
        postLogoutRedirectUris: array(str),
        allowedScopes: array(oneOf("openid", "profile", "email")),
        clientType: oneOf("PUBLIC"),
        status: oneOf("ACTIVE", "DISABLED"),
        firstParty: "true",
        createdAt: str,
        updatedAt: str,
      })
    ),
  }),
});

function checkShape(value: unknown, shape: Shape, path: string, problems: string[]): void {
  if (shape === "string") {
    if (typeof value !== "string") problems.push(`${path} must be a string`);
  } else if (shape === "true") {
    if (value !== true) problems.push(`${path} must be true`);
  } else if (shape.kind === "enum") {
    if (typeof value !== "string" || !shape.values.includes(value)) problems.push(`${path} must be one of ${shape.values.join(", ")}`);
  } else if (shape.kind === "array") {
    if (!Array.isArray(value)) problems.push(`${path} must be an array`);
    else value.forEach((item, i) => checkShape(item, shape.of, `${path}[${i}]`, problems));
  } else {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      problems.push(`${path} must be an object`);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) if (!(key in shape.fields)) problems.push(`${path}.${key} is not a RealmConfig field`);
    for (const [key, fieldShape] of Object.entries(shape.fields)) {
      if (!(key in record)) {
        if (!shape.optional?.includes(key)) problems.push(`${path}.${key} is required`);
      } else checkShape(record[key], fieldShape, `${path}.${key}`, problems);
    }
  }
}

/**
 * A RealmConfig supplied as data (parsed JSON) → a validated RealmConfig, or
 * a RealmConfigError naming every problem. Use this, never a cast, at the
 * boundary where an ID Product hands its configuration to the platform.
 */
export function parseRealmConfig(value: unknown): RealmConfig {
  const problems: string[] = [];
  checkShape(value, REALM_SHAPE, "realm", problems);
  if (problems.length > 0) {
    throw new RealmConfigError("Supplied RealmConfig is malformed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  }
  return validateRealmConfig(value as RealmConfig);
}
