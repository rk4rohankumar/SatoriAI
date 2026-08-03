// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

export type Caller = {
  userId: string;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

/** Verifies the Authorization bearer token and returns user-scoped + admin clients. */
export async function authenticate(req: Request): Promise<Caller> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new Error('missing bearer token');

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error('invalid token');

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { userId: data.user.id, userClient, adminClient };
}
