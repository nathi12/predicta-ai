// app/api/football/[...path]/route.ts
// API Proxy for Football-Data.org (App Router)

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const NEXT_PUBLIC_FOOTBALL_DATA_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY || '';
const FOOTBALL_DATA_API_URL = 'https://api.football-data.org/v4';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
) {
    // Check if API key is configured
    if (!NEXT_PUBLIC_FOOTBALL_DATA_KEY) {
        console.error('❌ NEXT_PUBLIC_FOOTBALL_DATA_KEY not configured in environment variables');
        return NextResponse.json(
            {
                error: 'API key not configured',
                message: 'Please set NEXT_PUBLIC_FOOTBALL_DATA_KEY in your environment variables'
            },
            { status: 500 }
        );
    }

    try {
        // Await params (Next.js 15+ requirement)
        const params = await context.params;

        // Get the path segments
        const apiPath = params.path?.join('/') || '';

        if (!apiPath) {
            return NextResponse.json(
                {
                    error: 'Invalid path',
                    message: 'Path parameter is required'
                },
                { status: 400 }
            );
        }

        // Get query parameters
        const searchParams = request.nextUrl.searchParams;
        const queryParams: Record<string, string> = {};
        searchParams.forEach((value, key) => {
            queryParams[key] = value;
        });

        console.log('🔄 Proxying Football-Data.org request');
        console.log('📍 Path:', apiPath);
        console.log('📋 Query params:', queryParams);
        console.log('🔗 Full URL:', `${FOOTBALL_DATA_API_URL}/${apiPath}`);

        // Make request to Football-Data.org API
        const response = await axios.get(`${FOOTBALL_DATA_API_URL}/${apiPath}`, {
            params: queryParams,
            headers: {
                'X-Auth-Token': NEXT_PUBLIC_FOOTBALL_DATA_KEY
            },
            timeout: 10000 // 10 second timeout
        });

        console.log('✅ Football-Data.org responded:', response.status);

        // Return the data with CORS headers
        return NextResponse.json(response.data, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 's-maxage=300, stale-while-revalidate'
            }
        });

    } catch (error: any) {
        console.error('❌ Proxy error:', error.message);

        if (error.response) {
            // Football-Data.org returned an error
            console.error('📛 Football-Data.org Status:', error.response.status);
            console.error('📛 Football-Data.org Data:', error.response.data);

            return NextResponse.json(
                {
                    error: error.response.data.message || 'API Error',
                    details: error.response.data,
                    statusCode: error.response.status
                },
                { status: error.response.status }
            );
        }

        // Network or other error
        return NextResponse.json(
            {
                error: 'Internal server error',
                message: error.message
            },
            { status: 500 }
        );
    }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}