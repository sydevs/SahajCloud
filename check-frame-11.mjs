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

// Get frame 11
const frameResponse = await fetch(`${API_URL}/api/frames/11`, {
  headers: {
    Authorization: `JWT ${token}`,
  },
})

const frame = await frameResponse.json()
console.log('Frame 11 details:')
console.log('  ID:', frame.id)
console.log('  Filename:', frame.filename)
console.log('  MIME type:', frame.mimeType)
console.log('  Created:', frame.createdAt)
console.log('  Updated:', frame.updatedAt)
console.log('  Timestamps match?', frame.createdAt === frame.updatedAt)
