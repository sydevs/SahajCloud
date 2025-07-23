import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Get the file path from the URL parameters
    const { path: pathSegments } = await params
    const filePath = pathSegments.join('/')
    
    // Construct the absolute path to the media file
    const mediaDir = path.resolve(process.cwd(), 'media')
    const fullPath = path.join(mediaDir, filePath)
    
    // Security check: ensure the file is within the media directory
    if (!fullPath.startsWith(mediaDir)) {
      return new NextResponse('Forbidden', { status: 403 })
    }
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return new NextResponse('File not found', { status: 404 })
    }
    
    // Read the file
    const file = fs.readFileSync(fullPath)
    
    // Determine content type based on file extension
    const ext = path.extname(fullPath).toLowerCase()
    let contentType = 'application/octet-stream'
    
    switch (ext) {
      case '.mp3':
        contentType = 'audio/mpeg'
        break
      case '.wav':
        contentType = 'audio/wav'
        break
      case '.ogg':
        contentType = 'audio/ogg'
        break
      case '.aac':
        contentType = 'audio/aac'
        break
      case '.mp4':
        contentType = 'video/mp4'
        break
      case '.webm':
        contentType = 'video/webm'
        break
      case '.mov':
        contentType = 'video/quicktime'
        break
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg'
        break
      case '.png':
        contentType = 'image/png'
        break
      case '.webp':
        contentType = 'image/webp'
        break
      case '.gif':
        contentType = 'image/gif'
        break
    }
    
    // Return the file with appropriate headers
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch (error) {
    console.error('Error serving media file:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}