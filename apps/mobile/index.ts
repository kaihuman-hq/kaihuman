// The app entry. Storage first: core stores read it while they are constructed, and expo-router
// imports them through the routes. The OS also starts here for the headless background task.
import './src/runtime/storage-entry.js';
import 'expo-router/entry';
