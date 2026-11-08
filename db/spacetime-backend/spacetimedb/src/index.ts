
import { schema, table, t } from "spacetimedb/server";

const spacetimedb = schema({
  person: table(
    { public: true },
    {
      name: t.string(),
    }
  ),

  message: table(
    { public: true },
    {
      sender: t.identity(),
      sent: t.timestamp(),
      text: t.string(),
    }
  ),
});

export default spacetimedb;

export const init = spacetimedb.init((_ctx) => {
  console.info("Toyota Assistant database initialized");
});

export const onConnect = spacetimedb.clientConnected((_ctx) => {
  console.info("Client connected");
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {
  console.info("Client disconnected");
});

export const add = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    ctx.db.person.insert({ name });
  }
);

export const send_message = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    ctx.db.message.insert({
      sender: ctx.sender,
      sent: ctx.timestamp,
      text,
    });
  }
);

export const sayHello = spacetimedb.reducer((ctx) => {
  for (const person of ctx.db.person.iter()) {
    console.info(`Hello, ${person.name}!`);
  }

  console.info("Hello, World!");
});
