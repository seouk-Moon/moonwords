import App from "../src/App";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <App
      supabaseUrl={process.env.MOONWORDS_SUPABASE_URL}
      supabasePublishableKey={process.env.MOONWORDS_SUPABASE_PUBLISHABLE_KEY}
    />
  );
}
