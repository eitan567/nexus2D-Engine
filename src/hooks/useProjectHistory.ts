import {useState} from 'react';
import {cloneProject} from '../lib/project-utils';
import {Project} from '../types';

type HistoryState = {
  history: Project[];
  index: number;
};

export function useProjectHistory(initialProject: Project) {
  const [state, setState] = useState<HistoryState>({
    history: [cloneProject(initialProject)],
    index: 0,
  });

  const current = state.history[state.index];

  const setProject = (nextProject: Project, options?: {replace?: boolean}) => {
    const snapshot = cloneProject(nextProject);

    setState((prev) => {
      if (options?.replace) {
        return {
          ...prev,
          history: prev.history.map((entry, entryIndex) =>
            entryIndex === prev.index ? snapshot : entry,
          ),
        };
      }

      return {
        history: [...prev.history.slice(0, prev.index + 1), snapshot],
        index: prev.index + 1,
      };
    });
  };

  const updateProject = (updater: (project: Project) => Project, options?: {replace?: boolean}) => {
    setState((prev) => {
      const currentProject = prev.history[prev.index];
      const snapshot = cloneProject(updater(currentProject));

      if (options?.replace) {
        return {
          ...prev,
          history: prev.history.map((entry, entryIndex) =>
            entryIndex === prev.index ? snapshot : entry,
          ),
        };
      }

      return {
        history: [...prev.history.slice(0, prev.index + 1), snapshot],
        index: prev.index + 1,
      };
    });
  };

  const undo = () => {
    setState((prev) => ({
      ...prev,
      index: Math.max(0, prev.index - 1),
    }));
  };

  const redo = () => {
    setState((prev) => ({
      ...prev,
      index: Math.min(prev.history.length - 1, prev.index + 1),
    }));
  };

  const reset = (project: Project) => {
    const snapshot = cloneProject(project);
    setState({
      history: [snapshot],
      index: 0,
    });
  };

  return {
    project: current,
    setProject,
    updateProject,
    undo,
    redo,
    reset,
    canUndo: state.index > 0,
    canRedo: state.index < state.history.length - 1,
  };
}
