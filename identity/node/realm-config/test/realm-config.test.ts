import { describe, it, expect } from "vitest";
import { hostOf, parseRealmConfig, RealmConfigError, validateRealmConfig, type RealmConfig } from "../src";
import { FIXTURE_REALM } from "./fixture";

// The RealmConfig contract's behaviour (identity/docs ADRs 0015, 0020, 0024).
// Moved with the package from the Identity Platform repository, whose own
// tests keep covering its Example realm and realm loader.

/** A copy of the fixture, to break one field at a time. */
function realm(overrides: (r: Mutable<RealmConfig>) => void = () => {}): RealmConfig {
  const r = structuredClone(FIXTURE_REALM) as unknown as Mutable<RealmConfig>;
  overrides(r);
  return r;
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };

function problems(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(RealmConfigError);
    return (e as Error).message;
  }
  throw new Error("expected the realm to be rejected");
}
const invalid = (r: RealmConfig) => problems(() => validateRealmConfig(r));

describe("validateRealmConfig", () => {
  it("accepts a valid realm and returns it unchanged", () => {
    expect(validateRealmConfig(FIXTURE_REALM)).toBe(FIXTURE_REALM);
  });

  it("rejects an invalid issuer", () => {
    expect(invalid(realm((r) => (r.identity.issuer = "http://id.example.test")))).toMatch(/identity.issuer .* must use https/);
    expect(invalid(realm((r) => (r.identity.issuer = "https://id.example.test/")))).toMatch(/bare origin/);
    expect(invalid(realm((r) => (r.identity.issuer = "not a url")))).toMatch(/is not a URL/);
    expect(invalid(realm((r) => (r.identity.issuer = "https://other.example.test")))).toMatch(/must equal identity.authenticationOrigin/);
  });

  it("rejects an invalid authentication origin", () => {
    const set = (origin: string) =>
      realm((r) => {
        r.identity.authenticationOrigin = origin;
        r.identity.issuer = origin;
      });
    expect(invalid(set("http://id.example.test"))).toMatch(/authenticationOrigin .* must use https/);
    expect(invalid(set("https://id.example.test/login"))).toMatch(/bare origin/);
    expect(invalid(set("https://id.elsewhere.example"))).toMatch(/not inside dns.zoneName/);
    expect(invalid(set("https://api.id.example.test"))).toMatch(/must be distinct/);
    expect(invalid(realm((r) => (r.identity.developmentOrigins = ["http://dev.example.test"])))).toMatch(/loopback http origin/);
  });

  it("rejects a passkey RP ID incompatible with the authentication origin", () => {
    expect(invalid(realm((r) => (r.identity.passkeyRpId = "auth.id.example.test")))).toMatch(/must be the authentication host/);
    expect(invalid(realm((r) => (r.identity.passkeyRpId = "evil-id.example.test")))).toMatch(/must be the authentication host/);
    expect(invalid(realm((r) => (r.identity.passkeyRpId = "test")))).toMatch(/two or more labels/);
    expect(() => validateRealmConfig(realm((r) => (r.identity.passkeyRpId = "example.test")))).not.toThrow();
  });

  it("rejects duplicate and dangling registrations", () => {
    expect(invalid(realm((r) => r.oauth.applications.push({ ...r.oauth.applications[0] })))).toMatch(/applications: duplicate id "notes"/);
    expect(invalid(realm((r) => r.oauth.clients.push({ ...r.oauth.clients[0], clientId: "another-client-id" })))).toMatch(/clients: duplicate id "notes"/);
    expect(invalid(realm((r) => r.oauth.clients.push({ ...r.oauth.clients[0], id: "notes-copy" })))).toMatch(/duplicate clientId "example-notes-client"/);
    expect(invalid(realm((r) => (r.oauth.clients[0].applicationId = "nobody")))).toMatch(/unknown applicationId "nobody"/);
    const legacy = (r: Mutable<RealmConfig>) => r.credentialAuthority.legacyRelyingPartyClients;
    expect(invalid(realm((r) => legacy(r).push({ ...legacy(r)[0], clientIdOutput: "OtherClientId" })))).toMatch(/duplicate name "notes"/);
    expect(invalid(realm((r) => legacy(r).push({ ...legacy(r)[0], name: "other" })))).toMatch(/duplicate clientIdOutput "NotesClientId"/);
    expect(invalid(realm((r) => (legacy(r)[0].clientIdOutput = "notes")))).toMatch(/clientIdOutput must look like/);
  });

  it("rejects unsafe callback and redirect URIs", () => {
    for (const uri of ["http://notes.example.test/cb", "https://notes.example.test/cb#x", "https://*.example.test/cb", "/cb"]) {
      expect(invalid(realm((r) => (r.oauth.clients[0].redirectUris = [uri])))).toMatch(/redirect URI/);
      expect(invalid(realm((r) => (r.credentialAuthority.legacyRelyingPartyClients[0].callbackUrls = [uri])))).toMatch(/callback URL/);
    }
  });

  it("rejects malformed product, branding, account, region and hostnames, reporting every problem at once", () => {
    const message = invalid(
      realm((r) => {
        r.product.id = "Example ID";
        r.branding.name = " ";
        r.aws.account = "12345";
        r.aws.region = "west";
        r.hostnames.api = "api.elsewhere.example";
        r.credentialAuthority.domainPrefix = "Bad_Prefix";
      })
    );
    for (const field of ["product.id", "branding.name", "12-digit", "not an AWS region", "hostnames.api", "domainPrefix"]) expect(message).toContain(field);
  });
});

/** A complete appearance, on example.test (RFC 2606): never fetched. */
const APPEARANCE = {
  backgroundImage: "https://www.example.test/images/cover.jpg",
  backgroundColor: "#0c1016",
  backgroundPosition: "50% 30%",
  backgroundSize: "cover",
  overlayOpacity: 0.6,
  accentColor: "#c89a4a",
} as const;

describe("branding.appearance", () => {
  it("is optional: a realm without one has the Provider's default presentation", () => {
    expect(FIXTURE_REALM.branding).not.toHaveProperty("appearance");
    expect(validateRealmConfig(realm())).toBeTruthy();
  });

  it("accepts a complete appearance, and one with only the required image and colour", () => {
    expect(validateRealmConfig(realm((r) => (r.branding.appearance = { ...APPEARANCE })))).toBeTruthy();
    expect(validateRealmConfig(realm((r) => (r.branding.appearance = { backgroundImage: APPEARANCE.backgroundImage, backgroundColor: "#000000" })))).toBeTruthy();
    for (const backgroundPosition of ["center", "left top", "0% 100%", "right 25%"]) {
      expect(validateRealmConfig(realm((r) => (r.branding.appearance = { ...APPEARANCE, backgroundPosition })))).toBeTruthy();
    }
  });

  it.each([
    ["an http image", { backgroundImage: "http://www.example.test/cover.jpg" }, /must use https/],
    ["a relative image", { backgroundImage: "/cover.jpg" }, /is not an absolute URL/],
    ["a non-canonical image URL", { backgroundImage: 'https://www.example.test/a b".jpg' }, /must be written canonically/],
    ["an image with userinfo", { backgroundImage: "https://u:p@www.example.test/cover.jpg" }, /must not contain userinfo/],
    ["a named colour", { backgroundColor: "black" }, /backgroundColor "black" must be/],
    ["an upper-case colour", { accentColor: "#C89A4A" }, /accentColor "#C89A4A" must be/],
    ["CSS in the position", { backgroundPosition: "center; color: red" }, /backgroundPosition .* must be/],
    ["three position values", { backgroundPosition: "left top 10%" }, /backgroundPosition .* must be/],
    ["an unknown size", { backgroundSize: "auto" }, /backgroundSize "auto" must be/],
    ["an overlay that hides the image", { overlayOpacity: 1 }, /overlayOpacity 1 must be/],
    ["a negative overlay", { overlayOpacity: -0.1 }, /overlayOpacity -0.1 must be/],
  ])("rejects %s", (_label, change, expected) => {
    expect(invalid(realm((r) => (r.branding.appearance = { ...APPEARANCE, ...(change as object) } as never)))).toMatch(expected);
  });

  it("is checked structurally when supplied as JSON", () => {
    const data = JSON.parse(JSON.stringify(FIXTURE_REALM));
    data.branding.appearance = { ...APPEARANCE };
    expect(JSON.stringify(parseRealmConfig(JSON.parse(JSON.stringify(data))))).toBe(JSON.stringify(data));
    for (const [mutate, expected] of [
      [(a: any) => (a.overlayOpacity = "0.6"), /overlayOpacity must be a number/],
      [(a: any) => (a.logo = "https://www.example.test/logo.png"), /appearance.logo is not a RealmConfig field/],
      [(a: any) => delete a.backgroundColor, /appearance.backgroundColor is required/],
      [(a: any) => (a.backgroundSize = "fill"), /backgroundSize must be one of cover, contain/],
    ] as const) {
      const copy = JSON.parse(JSON.stringify(data));
      mutate(copy.branding.appearance);
      expect(problems(() => parseRealmConfig(copy))).toMatch(expected);
    }
  });
});

describe("parseRealmConfig (a realm supplied as JSON)", () => {
  it("accepts a valid realm and preserves its field order", () => {
    const json = JSON.stringify(FIXTURE_REALM);
    expect(JSON.stringify(parseRealmConfig(JSON.parse(json)))).toBe(json);
  });

  it.each([
    ["a missing field", (r: any) => delete r.identity.passkeyRpId, /identity.passkeyRpId is required/],
    ["an unknown field", (r: any) => (r.identity.sessions = {}), /identity.sessions is not a RealmConfig field/],
    ["a mistyped field", (r: any) => (r.aws.account = 111122223333), /aws.account must be a string/],
    ["a non-array", (r: any) => (r.oauth.clients = {}), /oauth.clients must be an array/],
    ["an unknown scope", (r: any) => (r.oauth.clients[0].allowedScopes = ["admin"]), /allowedScopes\[0\] must be one of/],
    ["a non-first-party client", (r: any) => (r.oauth.clients[0].firstParty = false), /firstParty must be true/],
  ])("rejects %s", (_label, mutate, expected) => {
    const data = JSON.parse(JSON.stringify(FIXTURE_REALM));
    mutate(data);
    expect(problems(() => parseRealmConfig(data))).toMatch(expected);
  });

  it("rejects a structurally valid but inconsistent realm", () => {
    const data = JSON.parse(JSON.stringify(FIXTURE_REALM));
    data.identity.passkeyRpId = "elsewhere.test";
    expect(problems(() => parseRealmConfig(data))).toMatch(/passkeyRpId/);
  });
});

describe("hostOf", () => {
  it("is the host of an origin", () => {
    expect(hostOf("https://id.example.test")).toBe("id.example.test");
  });
});
