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

// Get recent frames
const framesResponse = await fetch(`${API_URL}/api/frames?limit=10&sort=-createdAt`, {
  headers: {
    Authorization: `JWT ${token}`,
  },
})

const framesData = await framesResponse.json()
console.log(`Total frames: ${framesData.totalDocs}`)
console.log('\nRecent frames:')
framesData.docs.forEach(frame => {
  console.log(`\nID: ${frame.id}`)
  console.log(`  Filename: ${frame.filename}`)
  console.log(`  MIME type: ${frame.mimeType}`)
  console.log(`  Created: ${frame.createdAt}`)
})
