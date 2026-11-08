import { DbConnection } from '@/db/module_bindings';
import { getStoredValue, setStoredValue } from '@/lib/secure-storage';

const TOKEN_KEY = 'spacetimedb-auth-token';
const DB_URI = 'wss://maincloud.spacetimedb.com';
const DB_NAME = 'heytoyota';

let connectionPromise: Promise<DbConnection> | undefined;

export async function getSpacetimeConnection() {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const token = await getStoredValue(TOKEN_KEY);
      return new Promise<DbConnection>((resolve, reject) => {
        DbConnection.builder()
          .withUri(DB_URI)
          .withDatabaseName(DB_NAME)
          .withToken(token ?? undefined)
          .onConnect((connection, _identity, newToken) => {
            void setStoredValue(TOKEN_KEY, newToken);
            resolve(connection);
          })
          .onConnectError((_ctx, error) => {
            connectionPromise = undefined;
            reject(error);
          })
          .build();
      });
    })();
  }
  return connectionPromise;
}

export async function getToyotaVoiceToken() {
  const connection = await getSpacetimeConnection();
  return connection.procedures.createToyotaVoiceToken({});
}

// Partner map/chat database is independent of the existing private voice database.
export { connectToSpacetimeDB, sendSpacetimeMessage, setSpacetimeName, saveSpacetimeServiceCenter } from './partner-spacetime';
export type { SavedServiceCenter, ChatMessage, SpacetimeStatus } from './partner-spacetime';
