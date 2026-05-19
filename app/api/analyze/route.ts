import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@/lib/types';

export const maxDuration = 30; // Allow Claude API enough time on Vercel Pro

const MOCK_INSIGHTS = [
  'Large ETH accumulation detected across multiple whale wallets. 3 addresses have been consistently buying dips — potential institutional positioning ahead of a catalyst.',
  'BTC on-chain data shows record exchange outflows. Whales moving funds to cold storage is historically bullish. Watch for reduced sell pressure in coming sessions.',
  'DeFi activity spiking on Arbitrum — swap volumes 340% above 7-day average. Possible token launch or airdrop farming event underway.',
  'Cross-chain bridge activity elevated: ETH → BASE flows increased 4x. Retail and institutional interest in Base ecosystem growing rapidly.',
];

interface AnalyzeRequest {
  transactions: Transaction[];
  query?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const { transactions, query } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json({ error: 'transactions array required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // If no API key, return a helpful mock
    if (!apiKey) {
      const mockInsight = MOCK_INSIGHTS[Math.floor(Math.random() * MOCK_INSIGHTS.length)];
      return NextResponse.json({
        insight: mockInsight,
        model: 'mock',
        txCount: transactions.length,
        isMock: true,
      });
    }

    // Build a concise summary for the AI to analyze
    const txSummary = transactions.slice(0, 20).map(tx => ({
      chain: tx.chain,
      token: tx.token,
      valueUSD: Math.round(tx.value),
      type: tx.type,
      from: tx.from.slice(0, 10) + '...',
      to: tx.to.slice(0, 10) + '...',
      isWhale: tx.isWhale,
      source: tx.source,
    }));

    const totalVolume = transactions.reduce((s, t) => s + t.value, 0);
    const chains = Array.from(new Set(transactions.map(t => t.chain)));
    const whaleCount = transactions.filter(t => t.isWhale).length;

    const userMessage = query
      ? `${query}\n\nTransaction data:\n${JSON.stringify(txSummary, null, 2)}`
      : `Analyze these ${transactions.length} whale transactions. Total volume: $${(totalVolume / 1e6).toFixed(2)}M across chains: ${chains.join(', ')}. ${whaleCount} are whale-tier (>$500K).\n\nTransactions:\n${JSON.stringify(txSummary, null, 2)}`;

    // Dynamic import to keep this server-side only
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a crypto whale analyst with deep blockchain expertise. Analyze the provided blockchain transactions and identify:
1) Suspicious patterns or coordinated whale activity
2) Likely market impact (bullish/bearish signals)
3) Which whales appear to be accumulating vs distributing
4) Notable cross-chain activity or arbitrage
5) Any anomalies worth watching

Be concise, actionable and data-driven. Use crypto-native language. Keep response under 200 words. Format with clear bullet points starting with ▸.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const insight = message.content[0].type === 'text' ? message.content[0].text : '';

    return NextResponse.json({
      insight,
      model: 'claude-haiku-4-5-20251001',
      txCount: transactions.length,
      isMock: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[analyze route]', message);

    // Return mock on any error so the UI doesn't break
    const mockInsight = MOCK_INSIGHTS[Math.floor(Math.random() * MOCK_INSIGHTS.length)];
    return NextResponse.json({
      insight: mockInsight,
      model: 'mock-fallback',
      txCount: 0,
      isMock: true,
      error: message,
    });
  }
}
