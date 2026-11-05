import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { FileEditorController, FileEditorState } from '../screens/file-editor-screen.js';
import { Body, Button, Field, Muted, Row, Screen, Title } from './primitives.js';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function FileBrowserView({
  controller,
  onOpenFile,
}: {
  controller: FileEditorController;
  onOpenFile: (path: string) => void;
}) {
  const [, setRev] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    controller
      .refresh()
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => setRev((n) => n + 1));
  }, [controller]);

  const go = (fn: () => void) => {
    fn();
    setRev((n) => n + 1);
  };
  const entries = controller.list();
  return (
    <Screen scroll>
      <Title>Files</Title>
      {error && (
        <View accessibilityRole="alert">
          <Body>{error}</Body>
        </View>
      )}
      <Muted>{`/${controller.folder}`}</Muted>
      <Row>
        <Button label="Root" onPress={() => go(() => controller.enter(''))} />
        {controller.folder && <Button label="Up" onPress={() => go(() => controller.up())} />}
      </Row>
      {entries.length === 0 && <Muted>Empty folder</Muted>}
      {entries.map((e) => (
        <Button
          key={e.path}
          testID={`entry-${e.path}`}
          label={
            e.kind === 'folder' ? `${e.name}/` : e.encrypted ? `${e.name} (encrypted)` : e.name
          }
          onPress={() =>
            e.kind === 'folder' ? go(() => controller.enter(e.path)) : onOpenFile(e.path)
          }
        />
      ))}
    </Screen>
  );
}

export function FileEditorView({
  controller,
  path,
}: {
  controller: FileEditorController;
  path: string;
}) {
  const [state, setState] = useState<FileEditorState>({ status: 'closed' });
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    controller
      .refresh()
      .then(() => controller.open(path))
      .then(setState)
      .catch((e: unknown) => setError(messageOf(e)));
    return () => controller.close();
  }, [controller, path]);

  const sync = () => setState(controller.state);

  if (state.status === 'locked') {
    return (
      <Screen>
        <Title>{path}</Title>
        <Muted>This file is encrypted.</Muted>
        {state.error && (
          <View accessibilityRole="alert">
            <Body>{state.error}</Body>
          </View>
        )}
        <Field label="Passphrase" value={passphrase} onChangeText={setPassphrase} secureTextEntry />
        <Button
          label="Unlock"
          disabled={!passphrase}
          onPress={() => {
            void controller.unlock(passphrase).then((s) => {
              setState(s);
              if (s.status === 'open') setPassphrase('');
            });
          }}
        />
      </Screen>
    );
  }

  if (state.status === 'open') {
    return (
      <Screen scroll>
        <Title>{path}</Title>
        {error && (
          <View accessibilityRole="alert">
            <Body>{error}</Body>
          </View>
        )}
        <Field
          label="Content"
          value={state.content}
          multiline
          onChangeText={(text) => {
            controller.edit(text);
            setSaved(false);
            sync();
          }}
        />
        <Row>
          <Button
            label="Save"
            disabled={!state.dirty}
            onPress={() => {
              setError(null);
              controller
                .save()
                .then(() => setSaved(true))
                .catch((e: unknown) => setError(messageOf(e)))
                .finally(sync);
            }}
          />
          {state.encrypted && (
            <Button
              label="Lock"
              onPress={() => {
                controller.lock();
                sync();
              }}
            />
          )}
        </Row>
        {saved && !state.dirty && <Muted>Saved</Muted>}
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{path}</Title>
      {error ? (
        <View accessibilityRole="alert">
          <Body>{error}</Body>
        </View>
      ) : (
        <Muted>Loading...</Muted>
      )}
    </Screen>
  );
}
