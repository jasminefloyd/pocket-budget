const SUPABASE_URL = 'https://micbqxkhejumwddmwyxm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pY2JxeGtoZWp1bXdkZG13eXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMzQzOTMsImV4cCI6MjA3MDgxMDM5M30.w1Mc6TrXvkRwjqc6gIGA4baVaMuwVHxR96nH5kt8BJg'

async function tryLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })
  return res.json()
}

async function queryTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,name,user_id&limit=5`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  return res.json()
}

async function main() {
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
    { email: 'jasminefloyd@test.com', password: 'password' },
    { email: 'jasminefloyd@test.com', password: 'test123' },
  ]

  console.log('Checking for test accounts...\n')

  for (const { email, password } of testAccounts) {
    const data = await tryLogin(email, password)
    if (data.access_token) {
      const user = data.user
      console.log(`SUCCESS: ${email} / ${password}`)
      console.log(`  User ID: ${user.id}`)
      console.log(`  Created: ${user.created_at}`)
      console.log(`  Display: ${user.user_metadata?.display_name || user.user_metadata?.name || 'N/A'}`)
    } else {
      console.log(`FAIL: ${email} / ${password} - ${data.error_description || data.msg || 'unknown error'}`)
    }
  }

  console.log('\nChecking public tables...')
  try {
    const budgets = await queryTable('budgets')
    if (Array.isArray(budgets)) {
      console.log(`Budgets found: ${budgets.length}`)
      budgets.forEach(b => console.log(`  - ${b.name} (user: ${b.user_id})`))
    } else {
      console.log('Budgets query:', JSON.stringify(budgets))
    }
  } catch (e) {
    console.log('Budgets error:', e.message)
  }

  try {
    const goals = await queryTable('goals')
    if (Array.isArray(goals)) {
      console.log(`Goals found: ${goals.length}`)
    } else {
      console.log('Goals query:', JSON.stringify(goals))
    }
  } catch (e) {
    console.log('Goals error:', e.message)
  }
}

main().catch(console.error)
