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

// Get frame 7
const frameResponse = await fetch(`${API_URL}/api/frames/7`, {
  headers: {
    Authorization: `JWT ${token}`,
  },
})

const frame = await frameResponse.json()
console.log('Frame 7 filename:', frame.filename)
console.log('Frame 7 MIME type:', frame.mimeType)
console.log('Frame 7 URL:', frame.url)
