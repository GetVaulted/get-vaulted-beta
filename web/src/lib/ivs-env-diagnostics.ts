/** Masked IVS/AWS env diagnostics for beta runtime checks — never returns secrets. */
export type IvsEnvDiagnostics = {
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  region: string;
  deployContext: string;
  credentialSource: string;
  accessKeyPrefix: string | null;
  secretKeyLength: number;
  accessKeyLength: number;
  hasSessionToken: boolean;
  vaultedAccessKeyPrefix: string | null;
  awsAccessKeyPrefix: string | null;
  resolvedFrom: "AWS_*" | "VAULTED_AWS_*" | "mixed" | "none";
  accessKeyVarPresent: {
    AWS_ACCESS_KEY_ID: boolean;
    VAULTED_AWS_ACCESS_KEY_ID: boolean;
  };
  secretKeyVarPresent: {
    AWS_SECRET_ACCESS_KEY: boolean;
    VAULTED_AWS_SECRET_ACCESS_KEY: boolean;
  };
  regionVarPresent: {
    AWS_REGION: boolean;
    VAULTED_AWS_REGION: boolean;
    VAULTED_AWS_DEFAULT_REGION: boolean;
  };
};

export function buildIvsEnvDiagnostics(): IvsEnvDiagnostics {
  const awsAccess = process.env.AWS_ACCESS_KEY_ID?.trim() ?? "";
  const vaultedAccess = process.env.VAULTED_AWS_ACCESS_KEY_ID?.trim() ?? "";
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY?.trim() ?? "";
  const vaultedSecret = process.env.VAULTED_AWS_SECRET_ACCESS_KEY?.trim() ?? "";

  const accessKey = vaultedAccess || awsAccess;
  const secretKey = vaultedSecret || awsSecret;

  const region =
    process.env.VAULTED_AWS_REGION?.trim() ||
    process.env.VAULTED_AWS_DEFAULT_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "";

  let credentialSource = "none";
  if (vaultedAccess && vaultedSecret) credentialSource = "VAULTED_AWS_*";
  else if (awsAccess && awsSecret) credentialSource = "AWS_*";
  else if (vaultedAccess && !vaultedSecret && awsSecret) credentialSource = "VAULTED_AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY";
  else if (awsAccess && !awsSecret && vaultedSecret) credentialSource = "AWS_ACCESS_KEY_ID + VAULTED_AWS_SECRET_ACCESS_KEY";
  else if (accessKey && !secretKey) credentialSource = "access_only_missing_secret";
  else if (!accessKey && secretKey) credentialSource = "secret_only_missing_access";

  let resolvedFrom: IvsEnvDiagnostics["resolvedFrom"] = "none";
  if (vaultedAccess && vaultedSecret) resolvedFrom = "VAULTED_AWS_*";
  else if (awsAccess && awsSecret) resolvedFrom = "AWS_*";
  else if (accessKey && secretKey) resolvedFrom = "mixed";

  return {
    hasAccessKey: Boolean(accessKey),
    hasSecretKey: Boolean(secretKey),
    region: region || "(missing)",
    deployContext: process.env.CONTEXT?.trim() || process.env.NETLIFY_CONTEXT?.trim() || "(unknown)",
    credentialSource,
    accessKeyPrefix: accessKey.length >= 4 ? accessKey.slice(0, 4) : accessKey.length > 0 ? accessKey : null,
    secretKeyLength: secretKey.length,
    accessKeyLength: accessKey.length,
    hasSessionToken: Boolean(process.env.AWS_SESSION_TOKEN?.trim()),
    vaultedAccessKeyPrefix: vaultedAccess.length >= 4 ? vaultedAccess.slice(0, 4) : null,
    awsAccessKeyPrefix: awsAccess.length >= 4 ? awsAccess.slice(0, 4) : null,
    resolvedFrom,
    accessKeyVarPresent: {
      AWS_ACCESS_KEY_ID: Boolean(awsAccess),
      VAULTED_AWS_ACCESS_KEY_ID: Boolean(vaultedAccess),
    },
    secretKeyVarPresent: {
      AWS_SECRET_ACCESS_KEY: Boolean(awsSecret),
      VAULTED_AWS_SECRET_ACCESS_KEY: Boolean(vaultedSecret),
    },
    regionVarPresent: {
      AWS_REGION: Boolean(process.env.AWS_REGION?.trim()),
      VAULTED_AWS_REGION: Boolean(process.env.VAULTED_AWS_REGION?.trim()),
      VAULTED_AWS_DEFAULT_REGION: Boolean(process.env.VAULTED_AWS_DEFAULT_REGION?.trim()),
    },
  };
}
