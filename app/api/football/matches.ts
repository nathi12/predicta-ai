// pages/api/football/matches.ts
// Simplified API proxy - specific endpoint for fetching matches

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
        const { competition, status } = req.query;

        if (!competition) {
            return res.status(400).json({
                error: 'Missing competition parameter',
                message: 'Please provide a competition code (e.g., PL, PD, SA)'
            });
        }

        const url = `${FOOTBALL_DATA_API_URL}/competitions/${competition}/matches`;

        console.log('🔄 Fetching matches:', url);
        console.log('📋 Params:', { status });

        const response = await axios.get(url, {
            params: { status: status || 'SCHEDULED' },
            headers: {
                'X-Auth-Token': NEXT_PUBLIC_FOOTBALL_DATA_KEY
            },
            timeout: 10000
        });

        console.log('✅ Success:', response.status);


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