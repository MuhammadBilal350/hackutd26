// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
import { schema, t, table, SenderError } from 'spacetimedb/server';

const user = table(
  { name: 'user', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string().optional(),
    online: t.bool(),
  }
);

const message = table(
  { name: 'message', public: true },
  { sender: t.identity(), sent: t.timestamp(), text: t.string() }
);


// Toyota service centers
const toyota_service_center = table(
  { name: 'toyota_service_center', public: true },
  {
    place_id: t.string().primaryKey(),
    name: t.string(),
    address: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    phone: t.string(),
    website: t.string(),
    is_toyota_authorized: t.bool(),
    authorization_status: t.string(),
    source: t.string(),
    updated_at: t.timestamp(),
  }
);

const spacetimedb = schema({ user, message, toyota_service_center });
export default spacetimedb;

function validateName(name: string) {
  if (!name) throw new SenderError('Names must not be empty');
}

export const set_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    validateName(name);
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) throw new SenderError('Cannot set name for unknown user');
    console.info(`User ${ctx.sender} sets name to ${name}`);
    ctx.db.user.identity.update({ ...user, name });
  }
);

function validateMessage(text: string) {
  if (!text) throw new SenderError('Messages must not be empty');
}

export const send_message = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    // Things to consider:
    // - Rate-limit messages per-user.
    // - Reject messages from unnamed user.
    validateMessage(text);
    console.info(`User ${ctx.sender}: ${text}`);
    ctx.db.message.insert({
      sender: ctx.sender,
      text,
      sent: ctx.timestamp,
    });
  }
);


// Save a Toyota service center or update it if its place_id already exists.
export const upsert_toyota_service_center = spacetimedb.reducer(
  {
    place_id: t.string(),
    name: t.string(),
    address: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    phone: t.string(),
    website: t.string(),
    is_toyota_authorized: t.bool(),
    authorization_status: t.string(),
    source: t.string(),
  },
  (ctx, center) => {
    if (!center.place_id.trim()) {
      throw new SenderError('Service center place_id is required');
    }

    if (!center.name.trim()) {
      throw new SenderError('Service center name is required');
    }

    if (
      !Number.isFinite(center.latitude) ||
      center.latitude < -90 ||
      center.latitude > 90 ||
      !Number.isFinite(center.longitude) ||
      center.longitude < -180 ||
      center.longitude > 180
    ) {
      throw new SenderError('Invalid service center coordinates');
    }

    const existing = ctx.db.toyota_service_center.place_id.find(
      center.place_id
    );

    const record = {
      ...center,
      updated_at: ctx.timestamp,
    };

    if (existing) {
      ctx.db.toyota_service_center.place_id.update(record);
    } else {
      ctx.db.toyota_service_center.insert(record);
    }
  }
);

// Called when the module is initially published
export const init = spacetimedb.init(_ctx => {});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const user = ctx.db.user.identity.find(ctx.sender);
  if (user) {
    // If this is a returning user, i.e. we already have a `User` with this `Identity`,
    // set `online: true`, but leave `name` and `identity` unchanged.
    ctx.db.user.identity.update({ ...user, online: true });
  } else {
    // If this is a new user, create a `User` row for the `Identity`,
    // which is online, but hasn't set a name.
    ctx.db.user.insert({
      name: undefined,
      identity: ctx.sender,
      online: true,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const user = ctx.db.user.identity.find(ctx.sender);
  if (user) {
    ctx.db.user.identity.update({ ...user, online: false });
  } else {
    // This branch should be unreachable,
    // as it doesn't make sense for a client to disconnect without connecting first.
    console.warn(
      `Disconnect event for unknown user with identity ${ctx.sender}`
    );
  }
});
