import { supabase } from '@/lib/supabase'
export function requireClient() {
  if (!supabase) throw new Error('Connect Supabase to enable this feature.')
  return supabase
}
export async function command<T = void>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await requireClient().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}
