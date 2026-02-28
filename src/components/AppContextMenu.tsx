import React, { useEffect, useMemo, useRef, useState } from 'react';

interface AppContextMenuProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistory: () => void;
}

interface MenuState {
  x: number;
  y: number;
  visible: boolean;
  hasSelection: boolean;
  isEditable: boolean;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
};

const runCommand = (command: string) => {
  try {
    document.execCommand(command);
  } catch (error) {
    console.warn(`执行命令失败: ${command}`, error);
  }
};

export const AppContextMenu: React.FC<AppContextMenuProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenHistory
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<MenuState>({
    x: 0,
    y: 0,
    visible: false,
    hasSelection: false,
    isEditable: false
  });

  const hideMenu = () => {
    setState((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();

      const selectionText = window.getSelection()?.toString() || '';
      const hasSelection = selectionText.trim().length > 0;
      const isEditable = isEditableTarget(event.target);

      setState({
        x: event.clientX,
        y: event.clientY,
        visible: true,
        hasSelection,
        isEditable
      });
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!state.visible) return;
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return;
      hideMenu();
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideMenu();
    };

    const onBlur = () => hideMenu();
    const onScroll = () => hideMenu();
    const onResize = () => hideMenu();

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [state.visible]);

  const positionStyle = useMemo(() => {
    const menuWidth = 260;
    const menuHeight = 260;
    const maxX = window.innerWidth - menuWidth - 8;
    const maxY = window.innerHeight - menuHeight - 8;
    return {
      left: `${Math.max(8, Math.min(state.x, maxX))}px`,
      top: `${Math.max(8, Math.min(state.y, maxY))}px`
    };
  }, [state.x, state.y]);

  if (!state.visible) return null;

  const actionClass = (disabled = false) =>
    `w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
      disabled
        ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
        : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-slate-700'
    }`;

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      <div
        ref={menuRef}
        style={positionStyle}
        className="absolute pointer-events-auto min-w-[240px] rounded-xl border border-gray-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl p-2"
      >
        <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
          快捷操作
        </div>
        <button
          className={actionClass(!canUndo)}
          disabled={!canUndo}
          onClick={() => {
            onUndo();
            hideMenu();
          }}
        >
          撤回 (Ctrl+Z)
        </button>
        <button
          className={actionClass(!canRedo)}
          disabled={!canRedo}
          onClick={() => {
            onRedo();
            hideMenu();
          }}
        >
          前进 (Ctrl+Y)
        </button>
        <button
          className={actionClass(false)}
          onClick={() => {
            onOpenHistory();
            hideMenu();
          }}
        >
          操作历史 (Ctrl+H)
        </button>

        <div className="my-2 border-t border-gray-200 dark:border-slate-700" />

        <button
          className={actionClass(!state.hasSelection)}
          disabled={!state.hasSelection}
          onClick={() => {
            runCommand('copy');
            hideMenu();
          }}
        >
          复制 (Ctrl+C)
        </button>
        <button
          className={actionClass(!state.isEditable)}
          disabled={!state.isEditable}
          onClick={() => {
            runCommand('cut');
            hideMenu();
          }}
        >
          剪切 (Ctrl+X)
        </button>
        <button
          className={actionClass(!state.isEditable)}
          disabled={!state.isEditable}
          onClick={() => {
            runCommand('paste');
            hideMenu();
          }}
        >
          粘贴 (Ctrl+V)
        </button>
        <button
          className={actionClass(false)}
          onClick={() => {
            runCommand('selectAll');
            hideMenu();
          }}
        >
          全选 (Ctrl+A)
        </button>
      </div>
    </div>
  );
};

