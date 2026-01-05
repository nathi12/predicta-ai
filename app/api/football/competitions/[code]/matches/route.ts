// app/api/football/competitions/[code]/matches/route.ts
// Correct endpoint structure for Football-Data.org

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const FOOTBALL_API_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY || '';
const FOOTBALL_DATA_API_URL = 'https://api.football-data.org/v4';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ code: string }> }
) {
    if (!FOOTBALL_API_KEY) {
        console.error('❌ NEXT_PUBLIC_FOOTBALL_DATA_KEY not configured');
        return NextResponse.json(
            { error: 'API key not configured' },
            { status: 500 }
        );
    }

    try {
        const params = await context.params;
        const competitionCode = params.code;

        if (!competitionCode) {
            return NextResponse.json(
                { error: 'Competition code is required' },
                { status: 400 }
            );
        }

        // Get query parameters
        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status') || 'SCHEDULED';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        // Build query params
        const queryParams: any = { status };
        if (dateFrom) queryParams.dateFrom = dateFrom;
        if (dateTo) queryParams.dateTo = dateTo;

        const url = `${FOOTBALL_DATA_API_URL}/competitions/${competitionCode}/matches`;

        console.log('🔄 Fetching from Football-Data.org');
        console.log('📍 URL:', url);
        console.log('📋 Params:', queryParams);

        const response = await axios.get(url, {
            params: queryParams,
            headers: {
                'X-Auth-Token': FOOTBALL_API_KEY
            },
            timeout: 15000
        });

        console.log('✅ Success:', response.status);
        console.log('📊 Matches found:', response.data.matches?.length || 0);

        return NextResponse.json(response.data, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300'
            }
        });

    } catch (error: any) {
        console.error('❌ Football-Data.org Error:', error.message);

        if (error.response) {
            console.error('📛 Status:', error.response.status);
            console.error('📛 Response:', error.response.data);

            return NextResponse.json(
                {
                    error: error.response.data.message || 'API Error',
                    details: error.response.data,
                    statusCode: error.response.status
                },
                { status: error.response.status }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error', message: error.message },
            { status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}