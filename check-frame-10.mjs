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

// Get frame 10
const frameResponse = await fetch(`${API_URL}/api/frames/10`, {
  headers: {
    Authorization: `JWT ${token}`,
  },
})

const frame = await frameResponse.json()
console.log('Frame 10:')
console.log(JSON.stringify(frame, null, 2))
