// pages/api/football/matches-with-dates.ts
// Alternative endpoint that includes explicit date range

import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const NEXT_PUBLIC_FOOTBALL_DATA_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY || '';
const FOOTBALL_DATA_API_URL = 'https://api.football-data.org/v4';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!NEXT_PUBLIC_FOOTBALL_DATA_KEY) {
        console.error('❌ NEXT_PUBLIC_FOOTBALL_DATA_KEY not configured');
        return res.status(500).json({
            error: 'API key not configured',
            message: 'Set NEXT_PUBLIC_FOOTBALL_DATA_KEY in environment variables'
        });
    }

    try {
        const { competition, status, dateFrom, dateTo } = req.query;

        if (!competition) {
            return res.status(400).json({
                error: 'Missing competition parameter',
                message: 'Please provide a competition code (e.g., PL, PD, SA)'
            });
        }

        // Build parameters
        const params: any = {
            status: status || 'SCHEDULED'
        };

        // Add date range if provided
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;

        const url = `${FOOTBALL_DATA_API_URL}/competitions/${competition}/matches`;

        console.log('🔄 Fetching matches with date range:', url);
        console.log('📋 Params:', params);

        const response = await axios.get(url, {
            params,
            headers: {
                'X-Auth-Token': NEXT_PUBLIC_FOOTBALL_DATA_KEY
            },
            timeout: 10000
        });

        console.log('✅ Success:', response.status);
        console.log('📊 Matches returned:', response.data.matches?.length || 0);

        // Log first few matches for debugging
        if (response.data.matches && response.data.matches.length > 0) {
            console.log('📝 Sample matches:');
            response.data.matches.slice(0, 3).forEach((match: any) => {
                console.log(`  - ${match.homeTeam.name} vs ${match.awayTeam.name} on ${match.utcDate}`);
            });
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=300');

        return res.status(200).json(response.data);

    } catch (error: any) {
        console.error('❌ Error:', error.message);

        if (error.response) {
            console.error('📛 Status:', error.response.status);
            console.error('📛 Data:', error.response.data);

            return res.status(error.response.status).json({
                error: error.response.data.message || 'API Error',
                details: error.response.data
            });
        }

        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}