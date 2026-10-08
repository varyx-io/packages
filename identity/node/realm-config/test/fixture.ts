import type { RealmConfig } from "../src";

/**
 * A valid realm to test the contract against. Neutral by construction:
 * RFC 2606 names (never resolvable) and AWS's documentation account. It is no
 * ID Product's realm, and no product's values belong in this package.
 */
export const FIXTURE_REALM = {
  product: { id: "example-id", displayName: "Example ID" },
  identity: {
    issuer: "https://id.example.test",
    authenticationOrigin: "https://id.example.test",
    passkeyRpId: "id.example.test",
    developmentOrigins: ["http://localhost:3000"],
  },
  branding: { name: "Example", siteTitle: "Example Identity" },
  aws: { account: "111122223333", region: "us-west-2" },
  dns: { zoneName: "example.test" },
  hostnames: { api: "api.id.example.test" },
  credentialAuthority: {
    customDomain: "auth.id.example.test",
    domainPrefix: "example-identity-auth",
    legacyRelyingPartyClients: [
      {
        name: "notes",
        clientIdOutput: "NotesClientId",
        callbackUrls: ["https://notes.example.test/auth/callback", "http://localhost:3000/auth/callback"],
        logoutUrls: ["https://notes.example.test/signed-out", "http://localhost:3000/signed-out"],
      },
    ],
  },
  oauth: {
    accessTokenAudience: "https://api.id.example.test",
    applications: [
      { id: "notes", displayName: "Notes", homepage: "https://notes.example.test" },
      { id: "journal", displayName: "Journal" },
    ],
    clients: [
      {
        id: "notes",
        clientId: "example-notes-client",
        applicationId: "notes",
        name: "Notes",
        redirectUris: ["https://notes.example.test/auth/callback", "http://localhost:3000/auth/callback"],
        postLogoutRedirectUris: ["https://notes.example.test/signed-out", "http://localhost:3000/signed-out"],
        allowedScopes: ["openid", "email", "profile"],
        clientType: "PUBLIC",
        status: "ACTIVE",
        firstParty: true,
        createdAt: "2026-10-04T00:00:00Z",
        updatedAt: "2026-10-04T00:00:00Z",
      },
    ],
  },
} as const satisfies RealmConfig;
