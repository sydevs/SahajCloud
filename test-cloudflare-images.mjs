import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_URL = 'https://cloud.sydevelopers.com'
const EMAIL = 'contact@sydevelopers.com'
const PASSWORD = 'WKR1emw6kam7kvk@vqu'

async function testCloudflareImages() {
  console.log('🧪 Phase 2: Testing Cloudflare Images Upload\n')

  // Step 1: Login
  console.log('Step 1: Logging in...')
  const loginResponse = await fetch(`${API_URL}/api/managers/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`)
  }

  const { token } = await loginResponse.json()
  console.log('✅ Login successful\n')

  // Step 2: Create a test image (1x1 red pixel PNG)
  const testImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  )
  const testImagePath = path.join(__dirname, 'test-image.png')
  fs.writeFileSync(testImagePath, testImageBuffer)
  console.log('Step 2: Created test image (1x1 red pixel PNG)\n')

  // Step 3: Upload image
  console.log('Step 3: Uploading image to Cloudflare Images...')
  const formData = new FormData()
  const blob = new Blob([testImageBuffer], { type: 'image/png' })
  formData.append('file', blob, 'test-image.png')
  // PayloadCMS expects non-file fields in _payload JSON field
  formData.append(
    '_payload',
    JSON.stringify({
      alt: 'Test image for Cloudflare Images adapter',
    }),
  )

  const uploadResponse = await fetch(`${API_URL}/api/images`, {
    method: 'POST',
    headers: {
      Authorization: `JWT ${token}`,
    },
    body: formData,
  })

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`)
  }

  const uploadResult = await uploadResponse.json()
  console.log('✅ Upload successful!\n')

  // Step 4: Verify response
  console.log('Step 4: Verifying response...')
  console.log('Response doc:', JSON.stringify(uploadResult.doc, null, 2))

  const { filename, url } = uploadResult.doc

  if (!filename) {
    throw new Error('❌ ERROR: Missing filename in response')
  }

  if (!url) {
    throw new Error('❌ ERROR: Missing url in response')
  }

  console.log('\n📊 Results:')
  console.log(`  Filename: ${filename}`)
  console.log(`  URL: ${url}`)

  // Step 5: Verify URL format
  if (!url.includes('imagedelivery.net')) {
    throw new Error(`❌ ERROR: URL does not contain 'imagedelivery.net': ${url}`)
  }

  if (!url.includes(filename)) {
    throw new Error(`❌ ERROR: URL does not contain filename/imageId: ${url}`)
  }

  // Step 6: Test URL accessibility
  console.log('\nStep 6: Testing URL accessibility...')
  const urlTestResponse = await fetch(url)

  if (!urlTestResponse.ok) {
    throw new Error(`❌ ERROR: URL returned ${urlTestResponse.status}: ${url}`)
  }

  console.log(`✅ URL accessible (${urlTestResponse.status})`)

  console.log('\n✅ Cloudflare Images test PASSED!')
  console.log('   - Image uploaded successfully')
  console.log('   - Filename contains Cloudflare Image ID')
  console.log('   - URL contains imagedelivery.net')
  console.log('   - URL format is correct')
  console.log('   - URL is accessible and returns 200\n')

  // Cleanup
  fs.unlinkSync(testImagePath)

  return uploadResult.doc.id
}

try {
  const imageId = await testCloudflareImages()
  console.log(`\n🎉 Test completed successfully! Image ID: ${imageId}`)
  process.exit(0)
} catch (error) {
  console.error('\n❌ Test failed:', error.message)
  console.error(error.stack)
  process.exit(1)
}
