
import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

interface TokenResponse {
  token?: string;
  message?: string;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { apiKey, meetingId, permissions } = req.body;
  const secretKey = process.env.VIDEOSDK_SECRET_KEY;

  if (!apiKey || !secretKey) {
    console.error("API key or Secret key is missing from environment variables or request body.");
    return res.status(400).json({ message: 'API key and secret key are required' });
  }

  try {
    // Create JWT payload
    const payload: {
        apikey: string;
        permissions: string[];
        version: number;
        exp: number;
        meetingId?: string;
    } = {
      apikey: apiKey,
      permissions: permissions || ['allow_join', 'allow_mod'], // Default permissions
      version: 2, // SDK version
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // Token expiry: 1 hour from now
    };

    if (meetingId) {
      payload.meetingId = meetingId;
    }

    // Sign the token with the secret key
    const token = jwt.sign(payload, secretKey, { algorithm: 'HS256' });

    res.status(200).json({ token });
  } catch (error) {
    console.error('Token generation error:', error);
    res