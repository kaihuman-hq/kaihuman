// jsdom does not implement IndexedDB; provide an in-memory implementation so
// modules that open the cache DB at import time (e.g. @kaihuman/core stores) load
// under test.
import 'fake-indexeddb/auto';
