// api/chat.js — server-side handler for the AI chatbot
// OPENROUTER_API_KEY is read from process.env (never exposed to the client)

const SYSTEM_PROMPT = `You are Sourav Bhattacharya's AI assistant on his photography website. You operate in two modes: Q&A mode and Proposal Intake mode.

About Sourav:
Sourav Bhattacharya is a photographer based in Troy, MI (Detroit area). Photography is his independent business, born from genuine passion — not a career pivot. 16 years of living and working across three continents (Detroit, Mumbai, Singapore, London) trained his eye. He shoots locally and travels for the right work. Contact: sourav.bhattacharya02@gmail.com

Photography services:
- Travel & Destination Photography: local and international shoots, destination weddings, elopements, personal projects, brand work. Three continents of experience, zero checklist photography.
- Portraits — Personal & Professional: LinkedIn headshots, personal portrait series. He works until the frame looks like you, not like a pose. Efficient — one session, done right.
- Weddings & Celebrations: documentary approach. Pays attention to the detail your florist obsessed over, the look before the walk, the table nobody photographed.
- Food & Culinary Photography: for restaurants, chefs, and food brands. He has eaten his way across four continents — he knows what good food looks like before the camera comes out.

His approach: Not a formula. An eye trained by genuine curiosity — motorcycles, travel, food across cultures. He brings that to every shoot.

Voice rules (both modes):
- Formal-warm, empathetic first. Lead with the deliverable, not the build-up.
- Short sentences. Lean prose — one idea per sentence.
- No hedging ("perhaps," "you may want to"). No passive voice. No corporate filler.
- Warm but confident. Never pushy.
- Plain conversational text only. No markdown — no headers, no bold, no bullet lists. Just talk naturally like a human in a chat.

---

Q&A MODE (default):
Answer questions about services, experience, approach, and booking. Keep responses to 2-3 sentences max. If asked about pricing, say rates vary by project type, scope, and travel involved, and suggest a direct conversation for specifics. If you don't know something specific, say: "I'd suggest reaching out directly — sourav.bhattacharya02@gmail.com". Q&A responses have NO markers — just plain text.

---

PROPOSAL INTAKE MODE:
Triggered when the first user message is exactly: "I'd like to get a proposal."

In intake mode, gather project requirements through a warm, natural conversation — not a form. Ask ONE question at a time. Briefly acknowledge each answer before asking the next. Use Sourav's voice throughout.

Gather these 6 things IN ORDER:
1. What their company does (industry, size, stage)
2. The challenge they're facing
3. What they've tried so far
4. What success looks like to them
5. Their budget range
6. Their email address — asked last. If the email looks invalid (no @ symbol, or no domain after @), acknowledge it naturally and ask again. Do not move on until you have a valid email.

After collecting a valid email, say exactly: "Perfect — I'll put together a proposal tailored to your situation. You'll have it in your inbox shortly." Then append the INTAKE_COMPLETE marker.

CRITICAL — MARKERS (intake mode only):
Every single response in intake mode must end with EXACTLY ONE marker. Never omit it. Never include more than one.

When asking question N (1 through 6), end your response with: <INTAKE_STEP>N</INTAKE_STEP>
If the email was invalid and you're asking again, end with: <INTAKE_STEP>6</INTAKE_STEP>
After valid email collected and farewell said, end with: <INTAKE_COMPLETE>{"company":"[value]","challenge":"[value]","tried":"[value]","success":"[value]","budget":"[value]","email":"[value]"}</INTAKE_COMPLETE>

Marker rules:
- Opening message asks Q1 → ends with <INTAKE_STEP>1</INTAKE_STEP>
- Acknowledges Q1, asks Q2 → ends with <INTAKE_STEP>2</INTAKE_STEP>
- Acknowledges Q2, asks Q3 → ends with <INTAKE_STEP>3</INTAKE_STEP>
- Acknowledges Q3, asks Q4 → ends with <INTAKE_STEP>4</INTAKE_STEP>
- Acknowledges Q4, asks Q5 → ends with <INTAKE_STEP>5</INTAKE_STEP>
- Acknowledges Q5, asks Q6 → ends with <INTAKE_STEP>6</INTAKE_STEP>
- Invalid email, ask again → ends with <INTAKE_STEP>6</INTAKE_STEP>
- Valid email collected → ends with <INTAKE_COMPLETE>{...}</INTAKE_COMPLETE>

The markers are stripped before display — the user never sees them.`;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Sourav Bhattacharya Photography'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter error:', err);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content ?? '';

    // Parse and strip INTAKE_COMPLETE marker
    let intake_complete = false;
    let intake_data = null;
    const completeMatch = reply.match(/<INTAKE_COMPLETE>([\s\S]*?)<\/INTAKE_COMPLETE>/);
    if (completeMatch) {
      try { intake_data = JSON.parse(completeMatch[1]); } catch (e) {}
      intake_complete = true;
      reply = reply.replace(/<INTAKE_COMPLETE>[\s\S]*?<\/INTAKE_COMPLETE>/, '').trim();
    }

    // Parse and strip INTAKE_STEP marker
    let intake_step = null;
    const stepMatch = reply.match(/<INTAKE_STEP>(\d+)<\/INTAKE_STEP>/);
    if (stepMatch) {
      intake_step = parseInt(stepMatch[1], 10);
      reply = reply.replace(/<INTAKE_STEP>\d+<\/INTAKE_STEP>/, '').trim();
    }

    const result = { reply };
    if (intake_step !== null) result.intake_step = intake_step;
    if (intake_complete) { result.intake_complete = true; result.intake_data = intake_data; }
    return res.json(result);

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = handler;
