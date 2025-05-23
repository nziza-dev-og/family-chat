
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

  // Client sends apiKey, but we use the server-side SECRET_KEY for signing
  const { apiKey, permissions: reqPermissions, meetingId: reqMeetingId } = req.body;
  const videoSDKApiKey = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;
  const secretKey = process.env.VIDEOSDK_SECRET_KEY;

  if (!videoSDKApiKey || !secretKey) {
    console.error("API key or Secret key is missing from environment variables.");
    return res.status(500).json({ message: 'Server configuration error for VideoSDK keys.' });
  }

  // Optional: Validate apiKey from client against server's apiKey if needed,
  // but primary security comes from using the server-side secretKey for signing.
  if (apiKey !== videoSDKApiKey) {
     console.warn("Client API key does not match server's public API key. Proceeding with server's key for token generation. This is usually fine if the client is just passing its public key for reference.");
     // This is more of a sanity check or logging point. The token will be signed with the server's credentials.
  }

  try {
    const payload: {
        apikey: string;
        permissions: string[];
        version: number;
        exp: number;
        meetingId?: string; // Optional meetingId
    } = {
      apikey: videoSDKApiKey, // Use the server's API key for the token payload
      permissions: reqPermissions || ['allow_join', 'allow_mod'], // Default permissions
      version: 2, // SDK version
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // Token expiry: 1 hour from now
    };

    if (reqMeetingId) {
      payload.meetingId = reqMeetingId;
    }

    const token = jwt.sign(payload, secretKey, { algorithm: 'HS256' });

    res.status(200).json({ token });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ message: 'Failed to generate VideoSDK token' });
  }
}

    