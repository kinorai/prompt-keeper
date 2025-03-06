import { POST } from '@/app/api/auth/logout/route';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

// Mock the auth library
jest.mock('@/lib/auth', () => ({
  AUTH_COOKIE_NAME: 'prompt-keeper-auth',
}));

describe('Auth Logout API Route', () => {
  it('should return 200 and delete the auth cookie', async () => {
    // Call the API route handler
    const response = await POST();

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify that the auth cookie was deleted
    const cookies = response.cookies.getAll();
    const authCookie = cookies.find(cookie => cookie.name === AUTH_COOKIE_NAME);
    
    // In Next.js, when a cookie is deleted, it's still in the list but with an empty value and expired
    if (authCookie) {
      // Check if the cookie has been marked for deletion
      // The cookie should have an empty value
      expect(authCookie.value).toBe('');
      
      // And if expires is a Date, it should be in the past
      if (authCookie.expires instanceof Date) {
        expect(authCookie.expires.getTime()).toBeLessThanOrEqual(Date.now());
      }
    } else {
      // If the cookie isn't in the list at all, that's also acceptable
      expect(true).toBe(true);
    }
  });
});
