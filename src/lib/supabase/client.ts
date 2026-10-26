import { createClient } from '@supabase/supabase-js'
import { environment } from '../validation/env'
export const supabase = environment.config
  ? createClient(
      environment.config.VITE_SUPABASE_URL,
      environment.config.VITE_SUPABASE_PUBLISHABLE_KEY,
    )
  : null
