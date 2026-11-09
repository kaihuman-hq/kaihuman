import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { TodoDetailController } from '../../../src/screens/todo-detail.js';
import { TodoDetailView } from '../../../src/views/todo-detail-view.js';

export default function TodoDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const controller = useMemo(() => new TodoDetailController(id), [id]);
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/board'));
  return (
    <>
      <Stack.Screen options={{ title: 'Todo' }} />
      <TodoDetailView controller={controller} onClose={close} />
    </>
  );
}
