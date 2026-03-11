import { RepositorySelector } from '../Organisms/RepositorySelector';

export default {
  title: 'LifeOS/Organisms/RepositorySelector',
  component: RepositorySelector,
};

const sampleRepos = [
  { id: '1', name: 'monorepo', full_name: 'lifosy/monorepo' },
  { id: '2', name: 'dotfiles', full_name: 'adam/dotfiles' },
  { id: '3', name: 'obsidian-vault', full_name: 'adam/obsidian-vault' },
  { id: '4', name: 'project-x', full_name: 'work/project-x' },
];

export const Selector = () => (
  <RepositorySelector
    repositories={sampleRepos}
    onSelect={(repo) => alert(`Selected: ${repo.full_name}`)}
  />
);

export const Loading = () => (
  <RepositorySelector repositories={[]} isLoading={true} onSelect={() => {}} />
);
