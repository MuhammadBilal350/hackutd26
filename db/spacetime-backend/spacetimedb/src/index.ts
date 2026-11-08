import { schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
  person: table(
    { public: true },
    {
      name: t.string(),
    }
  ),
  voiceTokenRequest: table(
    { name: 'voice_token_request' },
    {
      identity: t.identity().primaryKey(),
      lastRequested: t.timestamp(),
    }
  ),
}, {
  env: {
    ELEVENLABS_API_KEY: t.string(),
  },
});
export default spacetimedb;

export const init = spacetimedb.init(_ctx => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Called every time a new client connects
});

export const onDisconnect = spacetimedb.clientDisconnected(_ctx => {
  // Called every time a client disconnects
});

export const add = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    ctx.db.person.insert({ name });
  }
);

export const sayHello = spacetimedb.reducer(ctx => {
  for (const person of ctx.db.person.iter()) {
    console.info(`Hello, ${person.name}!`);
  }
  console.info('Hello, World!');
});

const TOYOTA_AGENT_ID = 'agent_2401m6wc8wc5ftgaaxm140hr97tm';

/** Mint a short-lived WebRTC token for the private Toyota voice agent.
 * The ElevenLabs API key stays in this SpacetimeDB module's environment.
 */
export const createToyotaVoiceToken = spacetimedb.procedure(
  {},
  t.string(),
  ctx => {
    const allowed = ctx.withTx(tx => {
      const prior = tx.db.voiceTokenRequest.identity.find(ctx.sender);
      if (
        prior &&
        ctx.timestamp.microsSinceUnixEpoch - prior.lastRequested.microsSinceUnixEpoch < 30_000_000n
      ) {
        return false;
      }
      if (prior) {
        tx.db.voiceTokenRequest.identity.update({ ...prior, lastRequested: ctx.timestamp });
      } else {
        tx.db.voiceTokenRequest.insert({ identity: ctx.sender, lastRequested: ctx.timestamp });
      }
      return true;
    });
    if (!allowed) throw new Error('Please wait before starting another Toyota voice session.');

    const response = ctx.http.fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${TOYOTA_AGENT_ID}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': ctx.env.ELEVENLABS_API_KEY },
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ElevenLabs token request failed (${response.status})`);
    }

    const payload: unknown = JSON.parse(response.text());
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('token' in payload) ||
      typeof payload.token !== 'string'
    ) {
      throw new Error('ElevenLabs returned an invalid session token response');
    }

    return payload.token;
  }
);
