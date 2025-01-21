import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const VALID_EMAIL = process.env.ADMIN_EMAIL
const VALID_PASSWORD = process.env.ADMIN_PASSWORD

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 // 24 hours
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
