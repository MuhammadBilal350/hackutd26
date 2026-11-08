import { DbConnection, tables } from "../module_bindings";

const HOST = process.env.EXPO_PUBLIC_SPACETIMEDB_HOST || "wss://maincloud.spacetimedb.com";
const DATABASE = process.env.EXPO_PUBLIC_SPACETIMEDB_DATABASE || "toyotautd-b9e7n";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SpacetimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
export type SavedServiceCenter = {
  placeId: string; name: string; address: string; latitude: number; longitude: number;
  phone: string; website: string; isToyotaAuthorized: boolean; authorizationStatus: string;
  source: string;
};

let activeConnection: DbConnection | null = null;
let connectionUsers = 0;
let activeCleanup: (() => void) | null = null;
type Listener = {
  messages: (rows: ChatMessage[]) => void;
  status?: (status: SpacetimeStatus) => void;
  users?: (rows: { name: string | undefined; online: boolean }[]) => void;
  centers?: (rows: SavedServiceCenter[]) => void;
};
const listeners = new Set<Listener>();

function readMessages(connection: DbConnection): ChatMessage[] {
  return Array.from(connection.db.message.iter(), (row): ChatMessage => {
    if (row.text.startsWith("[USER] ")) return { role: "user", content: row.text.slice(7) };
    if (row.text.startsWith("[TOYOTA] ")) return { role: "assistant", content: row.text.slice(9) };
    return { role: "user", content: row.text };
  });
}

/** One shared public client connection. Listener setup is done once and SDK subscriptions replay on reconnect. */
export function connectToSpacetimeDB(
  onMessages: (messages: ChatMessage[]) => void,
  onStatus?: (status: SpacetimeStatus) => void,
  onUsers?: (users: { name: string | undefined; online: boolean }[]) => void,
  onServiceCenters?: (centers: SavedServiceCenter[]) => void,
) {
  connectionUsers += 1;
  let disposed = false;
  const listener: Listener = { messages: onMessages, status: onStatus, users: onUsers, centers: onServiceCenters };
  listeners.add(listener);

  if (!activeConnection) {
    const connection = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DATABASE)
      .withAutomaticReconnect()
      .onConnect(() => notifyStatus("connected"))
      .onConnectError((_ctx, error) => {
        console.error("SpacetimeDB connection error:", error);
        notifyStatus("error");
      })
      .onDisconnect((_ctx, error, nextAttempt) => {
        notifyStatus(nextAttempt === undefined ? "disconnected" : "reconnecting");
        if (error) console.warn("SpacetimeDB disconnected:", error);
      })
      .build();

    activeConnection = connection;
    connection.db.message.onInsert(() => publishMessages());
    connection.db.message.onUpdate(() => publishMessages());
    connection.db.message.onDelete(() => publishMessages());
    connection.db.user.onInsert(() => publishUsers());
    connection.db.user.onUpdate(() => publishUsers());
    connection.db.user.onDelete(() => publishUsers());
    connection.db.toyotaServiceCenter.onInsert(() => publishCenters());
    connection.db.toyotaServiceCenter.onUpdate(() => publishCenters());
    connection.db.toyotaServiceCenter.onDelete(() => publishCenters());

    connection.subscriptionBuilder()
      .onApplied(() => {
        publishMessages();
        publishUsers();
        publishCenters();
        notifyStatus("connected");
      })
      .onError((ctx) => {
        console.error("SpacetimeDB subscription error:", ctx.event);
        notifyStatus("error");
      })
      .subscribe([tables.message, tables.user, tables.toyotaServiceCenter]);

    function publishMessages() { if (activeConnection === connection) for (const current of listeners) current.messages(readMessages(connection)); }
    function publishUsers() {
      if (activeConnection === connection) { const rows = Array.from(connection.db.user.iter(), (row) => ({ name: row.name, online: row.online })); for (const current of listeners) current.users?.(rows); }
    }
    function publishCenters() {
      if (activeConnection === connection) { const rows = Array.from(connection.db.toyotaServiceCenter.iter()); for (const current of listeners) current.centers?.(rows); }
    }

    activeCleanup = () => {
      if (activeConnection === connection) activeConnection = null;
      connection.disconnect();
    };
  }

  const connection = activeConnection;
  if (connection) {
    // Snapshots are also sent on a new consumer attaching to the shared connection.
    onMessages(readMessages(connection));
    onUsers?.(Array.from(connection.db.user.iter(), (row) => ({ name: row.name, online: row.online })));
    onServiceCenters?.(Array.from(connection.db.toyotaServiceCenter.iter()));
  }

  return () => {
    if (disposed) return;
    disposed = true;
    listeners.delete(listener);
    connectionUsers = Math.max(0, connectionUsers - 1);
    if (connectionUsers === 0) {
      activeCleanup?.();
      activeCleanup = null;
    }
  };
}

function notifyStatus(status: SpacetimeStatus) {
  for (const listener of listeners) listener.status?.(status);
}

export async function sendSpacetimeMessage(text: string) {
  if (!activeConnection) throw new Error("SpacetimeDB is not connected yet.");
  await activeConnection.reducers.sendMessage({ text });
}

export async function setSpacetimeName(name: string) {
  if (!activeConnection) throw new Error("SpacetimeDB is not connected yet.");
  await activeConnection.reducers.setName({ name });
}

export async function saveSpacetimeServiceCenter(center: {
  placeId: string; name: string; address: string; latitude: number; longitude: number;
  phone: string; website: string; isToyotaAuthorized: boolean; authorizationStatus: string; source: string;
}) {
  if (!activeConnection) throw new Error("SpacetimeDB is not connected yet.");
  await activeConnection.reducers.upsertToyotaServiceCenter(center);
}
