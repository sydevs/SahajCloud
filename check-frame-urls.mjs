const API_URL = 'https://cloud.sydevelopers.com'
const EMAIL = 'contact@sydevelopers.com'
const PASSWORD = 'WKR1emw6kam7kvk@vqu'

// Login
const loginResponse = await fetch(`${API_URL}/api/managers/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})

const { token } = await loginResponse.json()

// Get frames 7-12
for (const id of [7, 8, 9, 10, 11, 12]) {
  const frameResponse = await fetch(`${API_URL}/api/frames/${id}`, {
    headers: {
      Authorization: `JWT ${token}`,
    },
  })

  const frame = await frameResponse.json()
  console.log(`\nFrame ${id}:`)
  console.log(`  Filename: ${frame.filename}`)
  console.log(`  URL: ${frame.url}`)

  // Extract Video ID from URL
  const match = frame.url?.match(/cloudflarestream\.com\/([^\/]+)/)
  if (match) {
    console.log(`  Cloudflare Video ID: ${match[1]}`)
  }
}
