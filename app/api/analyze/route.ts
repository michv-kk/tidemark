import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@/lib/types';

export const maxDuration = 30;

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
    if (!apiKey) {
      return NextResponse.json({
        insight: null,
        model: 'none',
        txCount: transactions.length,
        isMock: true,
        error: 'ANTHROPIC_API_KEY not set',
      });
    }

    // Safe summary — handle missing fields gracefully
    const txSummary = transactions.slice(0, 30).map(tx => ({
      chain: tx.chain,
      token: tx.token ?? '?',
      valueUSD: Math.round(tx.value),
      type: tx.type,
      from: tx.from ? tx.from.slice(0, 10) + '…' : 'unknown',
      to:   tx.to   ? tx.to.slice(0, 10)   + '…' : 'unknown',
      isWhale: tx.isWhale,
      minsAgo: Math.round((Date.now() - tx.timestamp) / 60_000),
    }));

    const totalVolume = transactions.reduce((s, t) => s + t.value, 0);
    const chains      = Array.from(new Set(transactions.map(t => t.chain)));
    const whaleCount  = transactions.filter(t => t.isWhale).length;
    const tokens      = Array.from(new Set(transactions.map(t => t.token))).join(', ');
    const avgValue    = totalVolume / transactions.length;

    const contextBlock = [
      `Total transactions: ${transactions.length} (${whaleCount} whale-tier >$500K)`,
      `Total volume: $${(totalVolume / 1_000_000).toFixed(2)}M`,
      `Average tx size: $${Math.round(avgValue).toLocaleString()}`,
      `Chains active: ${chains.join(', ')}`,
      `Tokens moved: ${tokens}`,
    ].join('\n');

    const userMessage = query
      ? `${query}\n\nContext:\n${contextBlock}\n\nTransaction data (last 30):\n${JSON.stringify(txSummary, null, 2)}`
      : `Analyze this whale activity session.\n\nContext:\n${contextBlock}\n\nTransaction data (last 30, sorted newest first):\n${JSON.stringify(txSummary, null, 2)}`;

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: `You are a senior on-chain analyst at a crypto hedge fund. You have deep expertise in blockchain data, whale wallet behavior, and market microstructure.

Analyze the provided whale transaction data and deliver a professional, structured report covering:

▸ PATTERN ANALYSIS — identify any coordinated movements, repeated addresses, timing clusters, or unusual sequences
▸ MARKET SIGNAL — is the aggregate activity bullish, bearish or neutral? Why? Consider exchange flows vs cold storage movements
▸ TOKEN FOCUS — which tokens are being moved most aggressively and what does that imply
▸ NOTABLE WALLETS — highlight any standout addresses or suspicious clustering
▸ RISK FLAGS — anything anomalous, like sudden large single transfers, potential wash trading, or bridge arbitrage
▸ OUTLOOK — one clear takeaway for a trader watching this data right now

Be specific, use exact dollar amounts from the data, reference actual addresses when relevant. Write in a confident, professional tone. Avoid generic crypto platitudes. 4-6 bullet points total, each 2-3 sentences.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const insight = message.content[0]?.type === 'text' ? message.content[0].text : '';

    return NextResponse.json({
      insight,
      model: 'claude-haiku-4-5-20251001',
      txCount: transactions.length,
      isMock: false,
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[analyze]', errMsg);
    return NextResponse.json({
      insight: null,
      model: 'error',
      txCount: 0,
      isMock: true,
      error: errMsg,
    });
  }
}
