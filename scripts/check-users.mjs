import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  'https://micbqxkhejumwddmwyxm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pY2JxeGtoZWp1bXdkZG13eXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMzQzOTMsImV4cCI6MjA3MDgxMDM5M30.w1Mc6TrXvkRwjqc6gIGA4baVaMuwVHxR96nH5kt8BJg'
)

// Try common test credentials
const testAccounts = [
  { email: 'test@test.com', password: 'test123' },
  { email: 'test@test.com', password: 'password' },
  { email: 'test@test.com', password: 'Test123!' },
  { email: 'demo@demo.com', password: 'demo123' },
  { email: 'demo@google.com', password: 'password' },
  { email: 'admin@test.com', password: 'admin123' },
  { email: 'user@test.com', password: 'password' },
  { email: 'jasmine@test.com', password: 'password' },
  { email: 'jasmine@test.com', password: 'test123' },
]

console.log('Checking for test accounts...\n')

for (const { email, password } of testAccounts) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (data?.user) {
    console.log(`SUCCESS: ${email} / ${password}`)
    console.log(`  User ID: ${data.user.id}`)
    console.log(`  Created: ${data.user.created_at}`)
    console.log(`  Display: ${data.user.user_metadata?.display_name || data.user.user_metadata?.name || 'N/A'}`)
    await supabase.auth.signOut()
  } else {
    console.log(`FAIL: ${email} / ${password} - ${error?.message}`)
  }
}

// Also check if there are any budgets in the public tables (to see if data exists)
console.log('\nChecking public tables for any data...')
const { data: budgets, error: bErr } = await supabase.from('budgets').select('id, name, user_id').limit(5)
console.log('Budgets:', budgets?.length ?? 0, bErr?.message ?? 'OK')
if (budgets?.length) budgets.forEach(b => console.log(`  - ${b.name} (user: ${b.user_id})`))

const { data: goals, error: gErr } = await supabase.from('goals').select('id, name, user_id').limit(5)
console.log('Goals:', goals?.length ?? 0, gErr?.message ?? 'OK')
