'use client';

export default function TestEnvPage() {
  return (
    <div>
      <h1>Env Test</h1>
      <p>API Key: {process.env.NEXT_PUBLIC_FIREBASE_API_KEY}</p>
      <p>App ID: {process.env.NEXT_PUBLIC_FIREBASE_APP_ID}</p>
    </div>
  );
}
