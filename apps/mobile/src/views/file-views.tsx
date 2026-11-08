import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { presentTile } from '../components/widgets/tile-controllers.js';
import { fileKindForPath } from '../files/file-kinds.js';
import { type ImageSource, loadImage } from '../files/image-source.js';
import { useTheme } from '../theme/theme.js';
import { Text } from '../ui/index.js';
import {
  CsvTable,
  JsonReader,
  MarkdownReader,
  NoViewerNote,
  TextReader,
  YamlReader,
} from './file-readers.js';
import { Tile } from './tile-view.js';

export {
  CsvTable,
  JsonReader,
  MarkdownReader,
  NoViewerNote,
  TextReader,
  YamlReader,
} from './file-readers.js';

type ImageState =
  | { status: 'loading' }
  | { status: 'ready'; source: ImageSource }
  | { status: 'error'; error: string };

/** Fetches the repository file and shows it: SVG markup through react-native-svg, rasters aspect-fit. */
export function ImageViewer({ path, mime }: { path: string; mime: string }) {
  const { colors, spacing } = useTheme();
  const [state, setState] = useState<ImageState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadImage(path, mime).then(
      (source) => live && setState({ status: 'ready', source }),
      (e: unknown) =>
        live && setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [path, mime]);
  if (state.status === 'loading') {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading image"
        style={{ alignItems: 'center', padding: spacing.xl }}
      >
        <ActivityIndicator color={colors.secondaryLabel} />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <Text accessibilityRole="text" tone="danger" testID="image-error">
        {`Couldn't load the image: ${state.error}`}
      </Text>
    );
  }
  return (
    <View testID="reader-image" style={{ height: 420, alignItems: 'center' }}>
      {state.source.kind === 'svg' ? (
        <SvgXml xml={state.source.xml} width="100%" height="100%" />
      ) : (
        <Image
          accessibilityLabel={path.slice(path.lastIndexOf('/') + 1)}
          source={{ uri: state.source.uri }}
          resizeMode="contain"
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </View>
  );
}

/**
 * Picks the native view for a file: a dashboard tile for widget files, a reader for documents.
 * `content` is the decrypted text; `onWrite` receives the whole next text.
 */
export function FileContentView({
  path,
  content,
  onWrite,
}: {
  path: string;
  content: string;
  onWrite: (content: string) => void | Promise<void>;
}) {
  const [now] = useState(() => new Date());
  const { encrypted, innerPath, view } = fileKindForPath(path);
  switch (view.type) {
    case 'tile': {
      const tile = presentTile(innerPath, content, now);
      if (!tile) return <TextReader content={content} />;
      return (
        <Tile
          path={innerPath}
          tile={tile}
          content={content}
          now={now}
          onWrite={(_, next) => onWrite(next)}
        />
      );
    }
    case 'markdown':
      return <MarkdownReader content={content} />;
    case 'csv':
      return <CsvTable content={content} path={innerPath} />;
    case 'json':
      return <JsonReader content={content} />;
    case 'yaml':
      return <YamlReader content={content} />;
    case 'image':
      // An encrypted image's bytes are not in the decrypted text, so there is nothing to draw.
      return encrypted ? (
        <NoViewerNote ext={innerPath.slice(innerPath.lastIndexOf('.') + 1)} />
      ) : (
        <ImageViewer path={path} mime={view.mime} />
      );
    case 'text':
      return <TextReader content={content} />;
    default:
      return <NoViewerNote ext={view.ext} />;
  }
}
