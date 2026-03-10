import { KanbanBoard } from '@lifosy/ui';
import { route } from 'preact-router';

export const KanbanBoardPage = () => <KanbanBoard onNavigateBack={() => route('/')} />;
