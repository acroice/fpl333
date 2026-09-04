import { NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

export const dynamic = 'force-dynamic';

// TYMCZASOWY endpoint diagnostyczny — sprawdza TYLKO czy łańcuch Vercel OIDC -> GCP Workload
// Identity Federation -> impersonacja Service Account faktycznie działa (wymienia token na
// prawdziwy access token GCP), bez dotykania Firestore/BigQuery. Do usunięcia/zablokowania po
// potwierdzeniu, że konfiguracja WIF w GCP jest poprawna — nie zostaje w finalnej appce.
export async function GET() {
  const PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER;
  const POOL_ID = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const PROVIDER_ID = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const SA_EMAIL = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

  const missing = Object.entries({
    GCP_PROJECT_NUMBER: PROJECT_NUMBER,
    GCP_WORKLOAD_IDENTITY_POOL_ID: POOL_ID,
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: PROVIDER_ID,
    GCP_SERVICE_ACCOUNT_EMAIL: SA_EMAIL,
  }).filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    return NextResponse.json({ ok: false, step: 'env_vars', error: 'Brakuje zmiennych środowiskowych w Vercelu', missing }, { status: 500 });
  }

  try {
    const authClient = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA_EMAIL}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: getVercelOidcToken,
      },
    });

    if (!authClient) {
      return NextResponse.json({ ok: false, step: 'client_init', error: 'ExternalAccountClient.fromJSON zwrócił null — sprawdź format configu' }, { status: 500 });
    }

    const { token } = await authClient.getAccessToken();
    return NextResponse.json({
      ok: true,
      message: '🎉 Workload Identity Federation działa — token GCP uzyskany bez żadnego klucza.',
      tokenPreview: token ? `${token.slice(0, 12)}…` : null,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      step: 'token_exchange',
      error: e?.message || String(e),
      hint: 'Sprawdź: Issuer URL/Audience w providerze, mapowanie google.subject=assertion.sub, i czy IAM Principal (z rolą Workload Identity User na koncie usługi) dokładnie pasuje do team-slug/nazwy-projektu/environmentu.',
    }, { status: 500 });
  }
}
