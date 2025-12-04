import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_URL = 'https://cloud.sydevelopers.com'
const EMAIL = 'contact@sydevelopers.com'
const PASSWORD = 'WKR1emw6kam7kvk@vqu'

async function testCloudflareStream() {
  console.log('🧪 Phase 3: Testing Cloudflare Stream Upload\n')

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

  // Step 2: Create a minimal test video file using FFmpeg
  const testVideoPath = path.join(__dirname, 'test-video.mp4')
  console.log('Step 2: Creating test video (1 second, 2x2 pixels)...')

  const { execSync } = await import('child_process')
  try {
    // Create a 1-second video with 2x2 resolution (minimal size, dimensions divisible by 2)
    execSync(
      `ffmpeg -f lavfi -i color=c=red:s=2x2:d=1 -c:v libx264 -t 1 -pix_fmt yuv420p "${testVideoPath}" -y`,
      { stdio: 'pipe' },
    )
    console.log('✅ Test video created\n')
  } catch (error) {
    throw new Error(`Failed to create test video: ${error.message}`)
  }

  const testVideoBuffer = fs.readFileSync(testVideoPath)

  // Step 3: Upload video to Frames collection
  console.log('Step 3: Uploading video to Cloudflare Stream...')
  const formData = new FormData()
  const blob = new Blob([testVideoBuffer], { type: 'video/mp4' })
  formData.append('file', blob, 'test-video.mp4')
  // Frames collection requires imageSet and category fields
  formData.append(
    '_payload',
    JSON.stringify({
      imageSet: 'male',
      category: 'meditate',
    }),
  )

  const uploadResponse = await fetch(`${API_URL}/api/frames`, {
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

  const { filename, thumbnailUrl, streamMp4Url } = uploadResult.doc

  if (!filename) {
    throw new Error('❌ ERROR: Missing filename in response')
  }

  if (!thumbnailUrl) {
    throw new Error('❌ ERROR: Missing thumbnailUrl in response')
  }

  if (!streamMp4Url) {
    throw new Error('❌ ERROR: Missing streamMp4Url in response')
  }

  console.log('\n📊 Results:')
  console.log(`  Filename (Video ID): ${filename}`)
  console.log(`  Thumbnail URL: ${thumbnailUrl}`)
  console.log(`  Stream MP4 URL: ${streamMp4Url}`)

  // Step 5: Verify URL formats
  if (!thumbnailUrl.includes('cloudflarestream.com')) {
    throw new Error(`❌ ERROR: Thumbnail URL does not contain 'cloudflarestream.com': ${thumbnailUrl}`)
  }

  if (!streamMp4Url.includes('cloudflarestream.com')) {
    throw new Error(`❌ ERROR: Stream URL does not contain 'cloudflarestream.com': ${streamMp4Url}`)
  }

  if (!thumbnailUrl.includes('/thumbnails/thumbnail.jpg')) {
    throw new Error(`❌ ERROR: Thumbnail URL format incorrect: ${thumbnailUrl}`)
  }

  if (!streamMp4Url.includes('/downloads/default.mp4')) {
    throw new Error(`❌ ERROR: Stream MP4 URL format incorrect: ${streamMp4Url}`)
  }

  // Step 6: Test URL accessibility
  console.log('\nStep 6: Testing URL accessibility...')

  // Test thumbnail URL
  console.log('  Testing thumbnail URL...')
  const thumbnailResponse = await fetch(thumbnailUrl)
  if (!thumbnailResponse.ok) {
    throw new Error(`❌ ERROR: Thumbnail URL returned ${thumbnailResponse.status}: ${thumbnailUrl}`)
  }
  console.log(`  ✅ Thumbnail URL accessible (${thumbnailResponse.status})`)

  // Test MP4 URL
  console.log('  Testing MP4 URL...')
  const mp4Response = await fetch(streamMp4Url, { method: 'HEAD' }) // Use HEAD to avoid downloading entire video
  if (!mp4Response.ok) {
    throw new Error(`❌ ERROR: MP4 URL returned ${mp4Response.status}: ${streamMp4Url}`)
  }
  console.log(`  ✅ MP4 URL accessible (${mp4Response.status})`)

  console.log('\n✅ Cloudflare Stream test PASSED!')
  console.log('   - Video uploaded successfully')
  console.log('   - Filename is Cloudflare Stream Video ID')
  console.log('   - Thumbnail URL contains cloudflarestream.com')
  console.log('   - MP4 URL contains cloudflarestream.com')
  console.log('   - URL formats are correct')
  console.log('   - Both URLs are accessible and return 200\n')

  // Cleanup
  fs.unlinkSync(testVideoPath)

  return uploadResult.doc.id
}

try {
  const frameId = await testCloudflareStream()
  console.log(`\n🎉 Test completed successfully! Frame ID: ${frameId}`)
  process.exit(0)
} catch (error) {
  console.error('\n❌ Test failed:', error.message)
  console.error(error.stack)
  process.exit(1)
}
