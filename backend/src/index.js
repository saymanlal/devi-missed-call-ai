import express from 'express';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const { VoiceResponse } = twilio.twiml;

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

const conversations = new Map();

/* ---------------- HEALTH ---------------- */

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* ---------------- MISSED CALL ---------------- */

app.post('/webhook/missed-call', async (req, res) => {
  try {
    const { caller } = req.body;

    const call = await twilioClient.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: caller,
      url: `${BASE_URL}/webhook/voice`,
      statusCallback: `${BASE_URL}/webhook/status`,
      statusCallbackEvent: ['completed'],
      record: true,
      recordingStatusCallback: `${BASE_URL}/webhook/recording`,
      recordingStatusCallbackEvent: ['completed']
    });

    res.json({ success: true, callSid: call.sid });

  } catch (err) {
    console.error('Missed call error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- VOICE FLOW ---------------- */

app.all('/webhook/voice', async (req, res) => {
  try {
    const { CallSid, SpeechResult } = req.body;
    const response = new VoiceResponse();

    if (!conversations.has(CallSid)) {
      conversations.set(CallSid, { stage: 'greeting' });
    }

    const state = conversations.get(CallSid);

    if (state.stage === 'greeting') {
      response.say(
        { voice: 'Polly.Aditi', language: 'hi-IN' },
        'Namaskar, main DEVI Simon Sir ki personal AI assistant hoon. Aap kyun call kiye the?'
      );

      response.gather({
        input: 'speech',
        language: 'hi-IN',
        speechTimeout: 'auto',
        action: `${BASE_URL}/webhook/voice`,
        method: 'POST'
      });

      state.stage = 'listening';
      return res.type('text/xml').send(response.toString());
    }

    if (SpeechResult && state.stage === 'listening') {

      response.say(
        { voice: 'Polly.Aditi', language: 'hi-IN' },
        'Dhanyavaad. Kripya beep ke baad apna message chhod dijiye.'
      );

      response.record({
        maxLength: 120,
        playBeep: true,
        action: `${BASE_URL}/webhook/voice-end`,
        method: 'POST'
      });

      state.stage = 'recording';
      return res.type('text/xml').send(response.toString());
    }

    response.say(
      { voice: 'Polly.Aditi', language: 'hi-IN' },
      'Dhanyavaad. Namaste.'
    );

    response.hangup();

    return res.type('text/xml').send(response.toString());

  } catch (err) {
    console.error('Voice error:', err);

    const response = new VoiceResponse();
    response.say('Technical error.');
    response.hangup();

    return res.type('text/xml').send(response.toString());
  }
});

/* ---------------- VOICE END ---------------- */

app.all('/webhook/voice-end', (req, res) => {
  const response = new VoiceResponse();

  response.say(
    { voice: 'Polly.Aditi', language: 'hi-IN' },
    'Aapka message record ho gaya hai. Dhanyavaad.'
  );

  response.hangup();

  res.type('text/xml').send(response.toString());
});

/* ---------------- RECORDING ---------------- */

app.all('/webhook/recording', async (req, res) => {
  try {
    const { RecordingUrl, From } = req.body;

    const recordingLink = `${RecordingUrl}.mp3`;

    await twilioClient.messages.create({
      body:
        `📞 DEVI AI Missed Call\n\n` +
        `From: ${From}\n\n` +
        `Recording: ${recordingLink}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.USER_PHONE_NUMBER
    });

    res.sendStatus(200);

  } catch (err) {
    console.error('Recording error:', err);
    res.sendStatus(500);
  }
});

/* ---------------- STATUS ---------------- */

app.all('/webhook/status', (req, res) => {
  res.sendStatus(200);
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`DEVI backend running on port ${PORT}`);
});
