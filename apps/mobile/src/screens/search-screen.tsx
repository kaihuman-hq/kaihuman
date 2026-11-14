import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import type { SearchDoc } from '../search/documents.js';
import { openTarget } from '../search/open.js';
import {
  clearRecentSearches,
  recentSearches,
  rememberSearch,
  searchIndex,
  useSearchIndex,
} from '../search/store.js';
import { SearchView } from '../views/search-view.js';
import { useSignalValue } from '../views/use-signal.js';

const DEBOUNCE_MS = 120;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function SearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string | string[] }>();
  const initial = (Array.isArray(q) ? q[0] : q) ?? '';
  const [query, setQuery] = useState(initial);
  const bar = useRef<SearchBarCommands>(null);
  const version = useSearchIndex();
  const recents = useSignalValue(recentSearches);
  const debounced = useDebounced(query, DEBOUNCE_MS);
  const web = Platform.OS === 'web';

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` signals a changed index
  const groups = useMemo(() => searchIndex.search(debounced), [debounced, version]);

  const pickRecent = useCallback((recent: string) => {
    setQuery(recent);
    // The native bar owns its text, so it has to be told.
    bar.current?.setText(recent);
  }, []);

  const open = useCallback(
    (doc: SearchDoc) => {
      rememberSearch(query);
      openTarget(doc.target, {
        push: (href) => router.push(href as never),
        openUrl: (url) => void openBrowserAsync(url),
      });
    },
    [query, router],
  );

  return (
    <>
      <Stack.Screen
        options={{
          // Explicit so the iOS large "Search" title survives the native search bar.
          title: 'Search',
          // Already here; the stack's default search button would be a dead end.
          headerRight: undefined,
          headerLargeTitle: Platform.OS === 'ios',
          headerSearchBarOptions: web
            ? undefined
            : {
                ref: bar,
                placeholder: 'Search kaihuman',
                autoFocus: true,
                hideWhenScrolling: false,
                onChangeText: (e) => setQuery(e.nativeEvent.text),
                onSearchButtonPress: (e) => rememberSearch(e.nativeEvent.text),
              },
        }}
      />
      <SearchView
        query={query}
        onQueryChange={setQuery}
        groups={groups}
        recents={recents}
        onOpen={open}
        onPickRecent={pickRecent}
        onClearRecents={clearRecentSearches}
        showField={web}
      />
    </>
  );
}
