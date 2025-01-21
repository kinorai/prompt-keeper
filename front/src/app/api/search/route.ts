import { NextResponse } from 'next/server';

const API_KEY = process.env.API_KEY; // This env var will only be available server-side
const API_BASE_URL = process.env.API_BASE_URL;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate search mode
    const validModes = ['fuzzy', 'keyword', 'regex'];
    if (body.search_mode && !validModes.includes(body.search_mode)) {
      return NextResponse.json(
        { error: 'Invalid search mode' },
        { status: 400 }
      );
    }

    // Validate time range
    const validTimeRanges = ['all', 'hour', 'day', 'week', 'month', 'year'];
    if (body.time_range && !validTimeRanges.includes(body.time_range)) {
      return NextResponse.json(
        { error: 'Invalid time range' },
        { status: 400 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
