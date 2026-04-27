// Supabase Edge Function to clean up expired sessions
// Deploy with: supabase functions deploy cleanup-sessions
// Schedule with: supabase functions schedule cleanup-sessions --cron "0 0 * * *"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current timestamp
    const now = new Date().toISOString()

    // Delete expired sessions (cascade will delete related data)
    const { data, error } = await supabase
      .from('sessions')
      .delete()
      .lt('expires_at', now)
      .select('id')

    if (error) {
      throw error
    }

    const deletedCount = data?.length || 0

    console.log(`Cleaned up ${deletedCount} expired sessions`)

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deletedCount,
        timestamp: now,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Cleanup error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
