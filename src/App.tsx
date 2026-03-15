import {
  startTransition,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  Gamepad2,
  ImagePlus,
  Layers3,
  Map,
  Maximize2,
  Monitor,
  Move,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import {motion} from 'motion/react';
import {GameEngine} from './engine/Core';
import {useProjectHistory} from './hooks/useProjectHistory';
import {
  createBlankProject,
  createBlankScene,
  cloneProject,
  createBehavior,
  createCollider,
  createDefaultProject,
  createEntityFromPrefab,
  createRigidBody,
  createSampleProject,
  createScript,
  duplicateEntity,
  getActiveScene,
  getComponent,
  normalizeAiResponse,
  normalizeProject,
  projectStats,
  snapPoint,
  STORAGE_KEY,
} from './lib/project-utils';
import {
  AIResponsePayload,
  BehaviorComponent,
  ColliderComponent,
  ComponentType,
  Entity,
  EntityPrefab,
  Project,
  RigidBodyComponent,
  RuntimeSnapshot,
  Scene,
  SpriteComponent,
  TransformComponent,
  TransformMode,
  Vector2,
  ViewportMode,
} from './types';

const PREFABS: Array<{prefab: EntityPrefab; label: string; hint: string}> = [
  {prefab: 'player', label: 'Player', hint: 'Controllable hero'},
  {prefab: 'platform', label: 'Platform', hint: 'Static collision surface'},
  {prefab: 'enemy', label: 'Enemy', hint: 'Patrol behavior ready'},
  {prefab: 'collectible', label: 'Collectible', hint: 'Score pickup'},
  {prefab: 'goal', label: 'Goal', hint: 'Level objective'},
  {prefab: 'hazard', label: 'Hazard', hint: 'Respawn trigger'},
  {prefab: 'decoration', label: 'Decoration', hint: 'Visual dressing'},
  {prefab: 'custom', label: 'Custom', hint: 'Manual setup object'},
];

const AI_IDEAS = [
  'בנה לי משחק פלטפורמה קצר עם 3 collectibles ובוס קטן בסוף',
  'הוסף לשלב הנוכחי moving platforms, hazard lava ו־checkpoint אחד',
  'הפוך את המשחק ל־top-down dungeon עם מטרה לאסוף 5 אנרגיות',
];

type AiHealth = {
  ok: boolean;
  vertexAiConfigured?: boolean;
  project?: string | null;
  location?: string | null;
};

type TransformInteraction = 'move' | 'rotate' | 'scale';
type ScaleHandleId = 'scale-nw' | 'scale-ne' | 'scale-se' | 'scale-sw';
type ScaleHandleDirection = {
  id: ScaleHandleId;
  x: -1 | 1;
  y: -1 | 1;
  cursor: string;
};

const SCALE_HANDLE_DIRECTIONS: ScaleHandleDirection[] = [
  {id: 'scale-nw', x: -1, y: -1, cursor: 'nwse-resize'},
  {id: 'scale-ne', x: 1, y: -1, cursor: 'nesw-resize'},
  {id: 'scale-se', x: 1, y: 1, cursor: 'nwse-resize'},
  {id: 'scale-sw', x: -1, y: 1, cursor: 'nesw-resize'},
];

type DragState = {
  entityId: string;
  interaction: TransformInteraction;
  pointerStart: Vector2;
  transformStart: TransformComponent;
  spriteSize: Vector2;
  rotationPointerOffset?: number;
  scaleHandle?: ScaleHandleDirection;
} | null;

type PanState =
  | {
      mode: 'editor-pan';
      screenStart: Vector2;
    }
  | {
      mode: 'camera-drag';
      screenStart: Vector2;
      cameraStart: Vector2;
      frameSize: Vector2;
      zoomStart: number;
    }
  | null;

type StageViewportMode = 'world' | 'camera';
type TopMenuKey = 'file' | 'edit' | 'scene' | 'window' | 'assistant';
type MenuAction = {
  label: string;
  hint: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
};

function rotateVector(point: Vector2, radians: number): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function midpoint(left: Vector2, right: Vector2): Vector2 {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function loadInitialProject() {
  return createDefaultProject();
}

function readStoredProject() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return null;
  }

  try {
    return normalizeProject(JSON.parse(saved), createDefaultProject());
  } catch {
    return null;
  }
}

function matchesFilterQuery(filterText: string, ...values: Array<string | number | null | undefined>) {
  const query = filterText.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return values.some((value) => String(value ?? '').toLowerCase().includes(query));
}

function PanelHeader({
  icon,
  title,
  actions,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[#26282d] px-2.5 py-1.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text)]">
        <span className="text-[var(--accent)]">{icon}</span>
        {title}
      </div>
      {actions}
    </div>
  );
}

function TopMenuTrigger({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`nexus-menu-button ${active ? 'is-active' : ''}`}>
      {label}
    </button>
  );
}

function TopMenuPanel({
  actions,
}: {
  actions: MenuAction[];
}) {
  return (
    <div className="nexus-menu-panel">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onSelect}
          disabled={action.disabled}
          className="nexus-menu-item"
        >
          <div>
            <div className="text-[12px] font-medium text-[var(--text)]">{action.label}</div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">{action.hint}</div>
          </div>
          {action.shortcut && <span className="nexus-menu-shortcut">{action.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

function LauncherCard({
  title,
  subtitle,
  onClick,
  badge,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button onClick={onClick} className="nexus-launcher-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-[var(--text)]">{title}</div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{subtitle}</div>
        </div>
        {badge && <span className="nexus-launcher-badge">{badge}</span>}
      </div>
    </button>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--panel-alt)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[#2a2c31] px-3 py-2">
        <button
          type="button"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          className="nexus-section-toggle"
          aria-expanded={!isCollapsed}
        >
          <ChevronRight size={13} className={`nexus-section-chevron ${isCollapsed ? '' : 'is-open'}`} />
          <div className="min-w-0 text-left">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text)]">{title}</h3>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">{subtitle}</p>
          </div>
        </button>
        {action}
      </div>
      {!isCollapsed && <div className="p-3">{children}</div>}
    </section>
  );
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <LabeledField label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`nexus-input ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      />
    </LabeledField>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <LabeledField label={label}>
      <div className="flex items-center gap-2 rounded-sm border border-[var(--border)] bg-[#1c1d21] px-2 py-1.5">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-7 rounded border-0 bg-transparent p-0" />
        <input value={value} onChange={(event) => onChange(event.target.value)} className="nexus-input border-0 bg-transparent px-0 py-0" />
      </div>
    </LabeledField>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex h-8 w-full items-center justify-between rounded-sm border border-[var(--border)] bg-[#26282c] px-2.5 text-[12px] text-[var(--text)]"
    >
      <span>{label}</span>
      <span className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold ${checked ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[#34373d] text-[var(--muted)]'}`}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

function RuntimeBadge({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-[var(--border)] bg-[#26282c] px-2 py-1 text-[11px] text-[var(--muted)]">
      <span className="mr-2 uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <span className="font-semibold text-[var(--text)]">{children}</span>
    </div>
  );
}

function StagePill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-sm border border-[var(--border)] bg-[#232529]/95 px-2 py-1 text-[11px]">
      <span className="mr-2 uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <span className="font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[var(--border)] bg-[#26282c] text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-sm border px-2 ${
        active
          ? 'border-[#5b6068] bg-[#3a3d44] text-[var(--text)]'
          : 'border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[#2b2d32] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}

function PillButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="h-7 rounded-sm border border-[var(--border)] bg-[#26282c] px-2.5 text-[11px] text-[var(--muted)]"
    >
      {children}
    </button>
  );
}

function TouchButton({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: (pressed: boolean) => void;
}) {
  return (
    <button
      onMouseDown={() => onPress(true)}
      onMouseUp={() => onPress(false)}
      onMouseLeave={() => onPress(false)}
      onTouchStart={() => onPress(true)}
      onTouchEnd={() => onPress(false)}
      className="h-10 w-10 rounded-sm border border-[var(--border)] bg-[#2f3238] text-sm font-semibold text-white"
    >
      {children}
    </button>
  );
}

function ActionTouchButton({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: (pressed: boolean) => void;
}) {
  return (
    <button
      onMouseDown={() => onPress(true)}
      onMouseUp={() => onPress(false)}
      onMouseLeave={() => onPress(false)}
      onTouchStart={() => onPress(true)}
      onTouchEnd={() => onPress(false)}
      className="rounded-sm border border-[#5b6068] bg-[#3a3d44] px-4 py-3 text-[11px] font-semibold tracking-[0.12em] text-[var(--text)]"
    >
      {children}
    </button>
  );
}

function AiPanel({
  aiHealth,
  aiMode,
  setAiMode,
  aiPrompt,
  setAiPrompt,
  aiIdeas,
  aiStatus,
  aiError,
  aiSummary,
  aiNotes,
  onRun,
}: {
  aiHealth: AiHealth | null;
  aiMode: 'create' | 'extend';
  setAiMode: (mode: 'create' | 'extend') => void;
  aiPrompt: string;
  setAiPrompt: (value: string) => void;
  aiIdeas: string[];
  aiStatus: 'idle' | 'loading' | 'error';
  aiError: string;
  aiSummary: string;
  aiNotes: string[];
  onRun: () => void;
}) {
  return (
    <div className="space-y-2">
      <SectionCard title="Engine Assistant" subtitle="Aware of scenes, behaviors and scripts">
        <div className="rounded-sm border border-[var(--border)] bg-[#202226] p-2.5 text-[12px] text-[var(--muted)]">
          <div className="font-semibold text-[var(--text)]">
            {aiHealth?.vertexAiConfigured ? 'Vertex AI configured' : 'Vertex AI not fully configured'}
          </div>
          <div className="mt-1 text-xs">
            Project: {aiHealth?.project || 'missing'} • Location: {aiHealth?.location || 'missing'}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Mode" subtitle="Create a full game or edit the current one in place">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setAiMode('create')}
            className={`rounded-sm border px-2.5 py-2.5 text-left ${
              aiMode === 'create' ? 'border-[#5b6068] bg-[#3a3d44]' : 'border-[var(--border)] bg-[#26282c]'
            }`}
          >
            <div className="text-[12px] font-semibold text-[var(--text)]">Create Full Game</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">Build a complete fresh project.</div>
          </button>
          <button
            onClick={() => setAiMode('extend')}
            className={`rounded-sm border px-2.5 py-2.5 text-left ${
              aiMode === 'extend' ? 'border-[#5b6068] bg-[#3a3d44]' : 'border-[var(--border)] bg-[#26282c]'
            }`}
          >
            <div className="text-[12px] font-semibold text-[var(--text)]">Edit Existing Game</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">Add, fix or refactor using the current project context.</div>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Request" subtitle="Describe gameplay, fixes, systems or scripts">
        <textarea
          value={aiPrompt}
          onChange={(event) => setAiPrompt(event.target.value)}
          className="nexus-textarea h-40"
          placeholder="למשל: תקן את הפיזיקה של השחקן, הוסף moving platforms וכתוב script ל-door שנפתח אחרי איסוף 3 collectibles"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {aiIdeas.map((idea) => (
            <button
              key={idea}
              onClick={() => setAiPrompt(idea)}
              className="rounded-sm border border-[var(--border)] bg-[#26282c] px-2 py-1.5 text-[11px] text-[var(--muted)]"
            >
              {idea}
            </button>
          ))}
        </div>
        <button
          onClick={onRun}
          disabled={aiStatus === 'loading'}
          className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-sm border border-[#5b6068] bg-[#3a3d44] px-3 text-[12px] font-semibold text-[var(--text)] disabled:cursor-wait disabled:opacity-70"
        >
          {aiStatus === 'loading' ? <Sparkles size={16} className="animate-pulse" /> : <Wand2 size={16} />}
          {aiStatus === 'loading' ? 'Applying changes…' : 'Run Smart Edit'}
        </button>
        {aiError && <div className="mt-3 rounded-sm border border-[#5a4148] bg-[#34262a] px-3 py-2 text-[12px] text-[#e2c4cb]">{aiError}</div>}
      </SectionCard>

      <SectionCard title="Last Change Summary" subtitle="What the assistant changed inside the project">
        <div className="rounded-sm border border-[var(--border)] bg-[#202226] p-2.5 text-[12px] text-[var(--muted)]">
          {aiSummary || 'No AI edit has been applied yet.'}
        </div>
        {aiNotes.length > 0 && (
          <div className="mt-3 space-y-2">
            {aiNotes.map((note) => (
              <div key={note} className="rounded-sm border border-[var(--border)] bg-[#202226] px-2.5 py-2 text-[11px] text-[var(--muted)]">
                {note}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SceneInspector({
  activeScene,
  project,
  aiSummary,
  filterText,
  editorCameraStart,
  captureCameraStart,
  mutateActiveScene,
  mutateProject,
}: {
  activeScene: Scene;
  project: Project;
  aiSummary: string;
  filterText: string;
  editorCameraStart: Vector2 | null;
  captureCameraStart: () => void;
  mutateActiveScene: (mutator: (scene: Scene) => void, options?: {replace?: boolean}) => void;
  mutateProject: (mutator: (draft: Project) => void, options?: {replace?: boolean}) => void;
}) {
  const showSceneSettings = matchesFilterQuery(
    filterText,
    'scene settings',
    activeScene.name,
    'world gravity grid camera background',
  );
  const showControls = matchesFilterQuery(filterText, 'controls', Object.keys(project.controls).join(' '), Object.values(project.controls).join(' '));
  const showAssistant = matchesFilterQuery(filterText, 'assistant ai status summary', aiSummary);

  const hasVisibleSections = showSceneSettings || showControls || showAssistant;

  return (
    <div className="space-y-2">
      {showSceneSettings && (
        <SectionCard title="Scene Settings" subtitle="World, camera, gravity and grid">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="World Width"
              value={activeScene.settings.worldSize.x}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.worldSize.x = Math.max(1, Math.round(value));
                })
              }
            />
            <NumberField
              label="World Height"
              value={activeScene.settings.worldSize.y}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.worldSize.y = Math.max(1, Math.round(value));
                })
              }
            />
            <NumberField
              label="Gravity X"
              value={activeScene.settings.gravity.x}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.gravity.x = value;
                })
              }
            />
            <NumberField
              label="Gravity Y"
              value={activeScene.settings.gravity.y}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.gravity.y = value;
                })
              }
            />
            <NumberField
              label="Grid Size"
              value={activeScene.settings.gridSize}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.gridSize = value;
                })
              }
            />
            <LabeledField label="Scene Name">
              <input
                value={activeScene.name}
                onChange={(event) =>
                  mutateActiveScene((scene) => {
                    scene.name = event.target.value;
                  })
                }
                className="nexus-input"
              />
            </LabeledField>
            <NumberField
              label="Camera Start X"
              value={activeScene.settings.cameraStart.x}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.cameraStart.x = value;
                })
              }
            />
            <NumberField
              label="Camera Start Y"
              value={activeScene.settings.cameraStart.y}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.cameraStart.y = value;
                })
              }
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-[11px] text-[var(--muted)]">
              {editorCameraStart
                ? `Current view: ${Math.round(editorCameraStart.x)}, ${Math.round(editorCameraStart.y)}`
                : 'Current view is not available yet.'}
            </div>
            <button type="button" onClick={captureCameraStart} className="nexus-ghost-button">
              Use Current View
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <ColorField
              label="Background Top"
              value={activeScene.settings.backgroundTop}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.backgroundTop = value;
                })
              }
            />
            <ColorField
              label="Background Bottom"
              value={activeScene.settings.backgroundBottom}
              onChange={(value) =>
                mutateActiveScene((scene) => {
                  scene.settings.backgroundBottom = value;
                })
              }
            />
          </div>
          <div className="mt-3 space-y-2">
            <ToggleRow
              label="Show Grid"
              checked={activeScene.settings.showGrid}
              onChange={(checked) =>
                mutateActiveScene((scene) => {
                  scene.settings.showGrid = checked;
                })
              }
            />
            <ToggleRow
              label="Snap To Grid"
              checked={activeScene.settings.snapToGrid}
              onChange={(checked) =>
                mutateActiveScene((scene) => {
                  scene.settings.snapToGrid = checked;
                })
              }
            />
            <ToggleRow
              label="Camera Follow Player"
              checked={activeScene.settings.cameraFollowPlayer}
              onChange={(checked) =>
                mutateActiveScene((scene) => {
                  scene.settings.cameraFollowPlayer = checked;
                })
              }
            />
          </div>
        </SectionCard>
      )}

      {showControls && (
        <SectionCard title="Controls" subtitle="Bindings passed into the engine input layer">
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(project.controls) as Array<[keyof Project['controls'], string]>).map(([key, value]) => (
              <LabeledField key={key} label={key}>
                <input
                  value={value}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      draft.controls[key] = event.target.value;
                    })
                  }
                  className="nexus-input"
                />
              </LabeledField>
            ))}
          </div>
        </SectionCard>
      )}

      {showAssistant && (
        <SectionCard title="Smart Assistant Status" subtitle="Latest AI activity inside the engine">
          <div className="rounded-sm border border-[var(--border)] bg-[#202226] px-2.5 py-2 text-[12px] text-[var(--muted)]">
            {aiSummary || 'Open the AI tab to generate, fix or extend the current game with engine-aware changes.'}
          </div>
        </SectionCard>
      )}

      {!hasVisibleSections && <div className="nexus-section-empty">No scene detail groups match the current filter.</div>}
    </div>
  );
}

function ComponentInspector({
  selectedEntity,
  project,
  filterText,
  updateEntity,
  replaceTransform,
  replaceSprite,
  replaceRigidBody,
  replaceCollider,
  replaceBehavior,
  updateScript,
  addComponent,
  removeComponent,
}: {
  selectedEntity: Entity;
  project: Project;
  filterText: string;
  updateEntity: (updater: (entity: Entity) => void) => void;
  replaceTransform: (updater: (component: TransformComponent) => TransformComponent, options?: {replace?: boolean}) => void;
  replaceSprite: (updater: (component: SpriteComponent) => SpriteComponent, options?: {replace?: boolean}) => void;
  replaceRigidBody: (updater: (component: RigidBodyComponent) => RigidBodyComponent, options?: {replace?: boolean}) => void;
  replaceCollider: (updater: (component: ColliderComponent) => ColliderComponent, options?: {replace?: boolean}) => void;
  replaceBehavior: (updater: (component: BehaviorComponent) => BehaviorComponent, options?: {replace?: boolean}) => void;
  updateScript: (code: string) => void;
  addComponent: (type: ComponentType) => void;
  removeComponent: (type: ComponentType) => void;
}) {
  const transform = getComponent<TransformComponent>(selectedEntity, ComponentType.Transform);
  const sprite = getComponent<SpriteComponent>(selectedEntity, ComponentType.Sprite);
  const rigidBody = getComponent<RigidBodyComponent>(selectedEntity, ComponentType.RigidBody);
  const collider = getComponent<ColliderComponent>(selectedEntity, ComponentType.Collider);
  const behavior = getComponent<BehaviorComponent>(selectedEntity, ComponentType.Behavior);
  const script = selectedEntity.components.find((component) => component.type === ComponentType.Script) as {code: string} | undefined;
  const showEntitySection = matchesFilterQuery(filterText, 'entity', selectedEntity.name, selectedEntity.prefab, selectedEntity.tags.join(' '), selectedEntity.layer);
  const showTransformSection = transform && matchesFilterQuery(filterText, 'transform', 'position rotation scale');
  const showSpriteSection = sprite && matchesFilterQuery(filterText, 'sprite', sprite.shape, sprite.assetId, sprite.color);
  const showRigidBodySection = rigidBody && matchesFilterQuery(filterText, 'rigidbody physics', 'mass gravity drag velocity static');
  const showColliderSection = collider && matchesFilterQuery(filterText, 'collider collision trigger', collider.shape);
  const showBehaviorSection = behavior && matchesFilterQuery(filterText, 'behavior gameplay', behavior.kind, behavior.patrolAxis);
  const showScriptSection = script && matchesFilterQuery(filterText, 'script code', script.code);
  const showMissingRigidBody = !rigidBody && matchesFilterQuery(filterText, 'rigidbody physics add');
  const showMissingCollider = !collider && matchesFilterQuery(filterText, 'collider collision add');
  const showMissingBehavior = !behavior && matchesFilterQuery(filterText, 'behavior gameplay add');
  const showMissingScript = !script && matchesFilterQuery(filterText, 'script code add');
  const hasVisibleSections =
    showEntitySection ||
    Boolean(showTransformSection) ||
    Boolean(showSpriteSection) ||
    Boolean(showRigidBodySection) ||
    Boolean(showColliderSection) ||
    Boolean(showBehaviorSection) ||
    Boolean(showScriptSection) ||
    showMissingRigidBody ||
    showMissingCollider ||
    showMissingBehavior ||
    showMissingScript;
  const autoColliderSize = (() => {
    if (!collider || !sprite || !transform) {
      return null;
    }

    const baseWidth = Math.max(8, Math.abs(sprite.width * transform.scale.x));
    const baseHeight = Math.max(8, Math.abs(sprite.height * transform.scale.y));
    const radians = (transform.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const width = Math.max(8, baseWidth * cos + baseHeight * sin);
    const height = Math.max(8, baseWidth * sin + baseHeight * cos);
    const radius = Math.max(4, Math.min(width, height) / 2);

    return {width, height, radius};
  })();

  return (
    <div className="space-y-2">
      {showEntitySection && (
        <SectionCard title="Entity" subtitle="Identity and editor flags">
          <div className="space-y-3">
            <LabeledField label="Name">
              <input
                value={selectedEntity.name}
                onChange={(event) =>
                  updateEntity((entity) => {
                    entity.name = event.target.value;
                  })
                }
                className="nexus-input"
              />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="Prefab">
                <input value={selectedEntity.prefab} className="nexus-input" readOnly />
              </LabeledField>
              <NumberField
                label="Layer"
                value={selectedEntity.layer}
                onChange={(value) =>
                  updateEntity((entity) => {
                    entity.layer = value;
                  })
                }
              />
            </div>
            <LabeledField label="Tags">
              <input
                value={selectedEntity.tags.join(', ')}
                onChange={(event) =>
                  updateEntity((entity) => {
                    entity.tags = event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean);
                  })
                }
                className="nexus-input"
              />
            </LabeledField>
            <div className="space-y-2">
              <ToggleRow
                label="Hidden"
                checked={selectedEntity.hidden}
                onChange={(checked) =>
                  updateEntity((entity) => {
                    entity.hidden = checked;
                  })
                }
              />
              <ToggleRow
                label="Locked"
                checked={selectedEntity.locked}
                onChange={(checked) =>
                  updateEntity((entity) => {
                    entity.locked = checked;
                  })
                }
              />
            </div>
            <div className="rounded-sm border border-[var(--border)] bg-[#202226] px-2.5 py-2 text-[11px] text-[var(--muted)]">
              Use the prefab palette, scene templates and AI tab to iterate on this entity. Components below control engine behavior directly.
            </div>
          </div>
        </SectionCard>
      )}

      {showTransformSection && (
        <SectionCard title="Transform" subtitle="Position, rotation and scale">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Position X" value={transform.position.x} onChange={(value) => replaceTransform((component) => ({...component, position: {...component.position, x: value}}))} />
            <NumberField label="Position Y" value={transform.position.y} onChange={(value) => replaceTransform((component) => ({...component, position: {...component.position, y: value}}))} />
            <NumberField label="Rotation" value={transform.rotation} onChange={(value) => replaceTransform((component) => ({...component, rotation: value}))} />
            <NumberField label="Scale X" value={transform.scale.x} step={0.1} onChange={(value) => replaceTransform((component) => ({...component, scale: {...component.scale, x: value}}))} />
            <NumberField label="Scale Y" value={transform.scale.y} step={0.1} onChange={(value) => replaceTransform((component) => ({...component, scale: {...component.scale, y: value}}))} />
          </div>
        </SectionCard>
      )}

      {showSpriteSection && (
        <SectionCard title="Sprite" subtitle="Visual configuration">
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Shape">
              <select value={sprite.shape} onChange={(event) => replaceSprite((component) => ({...component, shape: event.target.value as SpriteComponent['shape']}))} className="nexus-select">
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="diamond">Diamond</option>
              </select>
            </LabeledField>
            <LabeledField label="Asset">
              <select value={sprite.assetId} onChange={(event) => replaceSprite((component) => ({...component, assetId: event.target.value}))} className="nexus-select">
                <option value="">Generated shape</option>
                {project.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </LabeledField>
            <NumberField label="Width" value={sprite.width} onChange={(value) => replaceSprite((component) => ({...component, width: value}))} />
            <NumberField label="Height" value={sprite.height} onChange={(value) => replaceSprite((component) => ({...component, height: value}))} />
            <NumberField label="Opacity" value={sprite.opacity} step={0.1} onChange={(value) => replaceSprite((component) => ({...component, opacity: value}))} />
            <ColorField label="Tint" value={sprite.color} onChange={(value) => replaceSprite((component) => ({...component, color: value}))} />
          </div>
          <div className="mt-3 space-y-2">
            <ToggleRow label="Flip X" checked={sprite.flipX} onChange={(checked) => replaceSprite((component) => ({...component, flipX: checked}))} />
            <ToggleRow label="Flip Y" checked={sprite.flipY} onChange={(checked) => replaceSprite((component) => ({...component, flipY: checked}))} />
          </div>
        </SectionCard>
      )}

      {showRigidBodySection ? (
        <SectionCard title="RigidBody" subtitle="Physics movement and constraints" action={<DangerTextButton onClick={() => removeComponent(ComponentType.RigidBody)}>Remove</DangerTextButton>}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Mass" value={rigidBody.mass} onChange={(value) => replaceRigidBody((component) => ({...component, mass: value}))} />
            <NumberField label="Gravity Scale" value={rigidBody.gravityScale} onChange={(value) => replaceRigidBody((component) => ({...component, gravityScale: value}))} />
            <NumberField label="Drag X" value={rigidBody.drag.x} onChange={(value) => replaceRigidBody((component) => ({...component, drag: {...component.drag, x: value}}))} />
            <NumberField label="Drag Y" value={rigidBody.drag.y} onChange={(value) => replaceRigidBody((component) => ({...component, drag: {...component.drag, y: value}}))} />
            <NumberField label="Max Vel X" value={rigidBody.maxVelocity.x} onChange={(value) => replaceRigidBody((component) => ({...component, maxVelocity: {...component.maxVelocity, x: value}}))} />
            <NumberField label="Max Vel Y" value={rigidBody.maxVelocity.y} onChange={(value) => replaceRigidBody((component) => ({...component, maxVelocity: {...component.maxVelocity, y: value}}))} />
          </div>
          <div className="mt-3">
            <ToggleRow label="Static Body" checked={rigidBody.isStatic} onChange={(checked) => replaceRigidBody((component) => ({...component, isStatic: checked}))} />
          </div>
        </SectionCard>
      ) : showMissingRigidBody ? (
        <AddComponentCard title="RigidBody" onClick={() => addComponent(ComponentType.RigidBody)} />
      ) : null}

      {showColliderSection ? (
        <SectionCard title="Collider" subtitle="Collision shape and trigger settings" action={<DangerTextButton onClick={() => removeComponent(ComponentType.Collider)}>Remove</DangerTextButton>}>
          <div className="mb-3 space-y-2">
            <ToggleRow
              label="Auto Size"
              checked={collider.autoSize}
              onChange={(checked) => replaceCollider((component) => ({...component, autoSize: checked}))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Shape">
              <select value={collider.shape} onChange={(event) => replaceCollider((component) => ({...component, shape: event.target.value as ColliderComponent['shape']}))} className="nexus-select">
                <option value="box">Box</option>
                <option value="circle">Circle</option>
              </select>
            </LabeledField>
            <NumberField
              label="Radius"
              value={collider.autoSize ? (autoColliderSize?.radius ?? collider.radius) : collider.radius}
              disabled={collider.autoSize}
              onChange={(value) => replaceCollider((component) => ({...component, radius: value}))}
            />
            <NumberField
              label="Width"
              value={collider.autoSize ? (autoColliderSize?.width ?? collider.width) : collider.width}
              disabled={collider.autoSize}
              onChange={(value) => replaceCollider((component) => ({...component, width: value}))}
            />
            <NumberField
              label="Height"
              value={collider.autoSize ? (autoColliderSize?.height ?? collider.height) : collider.height}
              disabled={collider.autoSize}
              onChange={(value) => replaceCollider((component) => ({...component, height: value}))}
            />
            <NumberField label="Offset X" value={collider.offsetX} onChange={(value) => replaceCollider((component) => ({...component, offsetX: value}))} />
            <NumberField label="Offset Y" value={collider.offsetY} onChange={(value) => replaceCollider((component) => ({...component, offsetY: value}))} />
          </div>
          <div className="mt-3 space-y-2">
            <ToggleRow label="Trigger" checked={collider.isTrigger} onChange={(checked) => replaceCollider((component) => ({...component, isTrigger: checked}))} />
            <ToggleRow label="Pass Through" checked={collider.isPassThrough} onChange={(checked) => replaceCollider((component) => ({...component, isPassThrough: checked}))} />
          </div>
        </SectionCard>
      ) : showMissingCollider ? (
        <AddComponentCard title="Collider" onClick={() => addComponent(ComponentType.Collider)} />
      ) : null}

      {showBehaviorSection ? (
        <SectionCard title="Behavior" subtitle="Built-in gameplay logic" action={<DangerTextButton onClick={() => removeComponent(ComponentType.Behavior)}>Remove</DangerTextButton>}>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Kind">
              <select value={behavior.kind} onChange={(event) => replaceBehavior((component) => ({...component, kind: event.target.value as BehaviorComponent['kind']}))} className="nexus-select">
                <option value="none">none</option>
                <option value="player-platformer">player-platformer</option>
                <option value="player-topdown">player-topdown</option>
                <option value="enemy-patrol">enemy-patrol</option>
                <option value="moving-platform">moving-platform</option>
                <option value="collectible">collectible</option>
                <option value="goal">goal</option>
                <option value="hazard">hazard</option>
              </select>
            </LabeledField>
            <NumberField label="Move Speed" value={behavior.moveSpeed} onChange={(value) => replaceBehavior((component) => ({...component, moveSpeed: value}))} />
            <NumberField label="Jump Force" value={behavior.jumpForce} onChange={(value) => replaceBehavior((component) => ({...component, jumpForce: value}))} />
            <NumberField label="Patrol Distance" value={behavior.patrolDistance} onChange={(value) => replaceBehavior((component) => ({...component, patrolDistance: value}))} />
            <NumberField label="Patrol Speed" value={behavior.patrolSpeed} onChange={(value) => replaceBehavior((component) => ({...component, patrolSpeed: value}))} />
            <NumberField label="Collectible Value" value={behavior.collectibleValue} onChange={(value) => replaceBehavior((component) => ({...component, collectibleValue: value}))} />
            <LabeledField label="Patrol Axis">
              <select value={behavior.patrolAxis} onChange={(event) => replaceBehavior((component) => ({...component, patrolAxis: event.target.value as BehaviorComponent['patrolAxis']}))} className="nexus-select">
                <option value="x">X</option>
                <option value="y">Y</option>
              </select>
            </LabeledField>
          </div>
        </SectionCard>
      ) : showMissingBehavior ? (
        <AddComponentCard title="Behavior" onClick={() => addComponent(ComponentType.Behavior)} />
      ) : null}

      {showScriptSection ? (
        <SectionCard title="Script" subtitle="Inline engine-aware behavior" action={<DangerTextButton onClick={() => removeComponent(ComponentType.Script)}>Remove</DangerTextButton>}>
          <textarea value={script.code} onChange={(event) => updateScript(event.target.value)} className="nexus-textarea h-40 font-mono text-xs" />
        </SectionCard>
      ) : showMissingScript ? (
        <AddComponentCard title="Script" onClick={() => addComponent(ComponentType.Script)} />
      ) : null}

      {!hasVisibleSections && <div className="nexus-section-empty">No component groups match the current filter.</div>}
    </div>
  );
}

function DangerTextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button onClick={onClick} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d7a8b2]">
      {children}
    </button>
  );
}

function AddComponentCard({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-sm border border-dashed border-[var(--border-strong)] bg-[#26282c] px-3 py-3 text-left"
    >
      <div>
        <div className="text-[12px] font-semibold text-[var(--text)]">Add {title}</div>
        <div className="mt-1 text-[11px] text-[var(--muted)]">Inject another engine capability into this entity.</div>
      </div>
      <Plus size={14} className="text-[var(--accent)]" />
    </button>
  );
}

function ProjectLauncher({
  hasSavedProject,
  onClose,
  onCreateBlank,
  onResumeSaved,
  onLoadPlatformer,
  onLoadTopDown,
  onImportProject,
}: {
  hasSavedProject: boolean;
  onClose?: () => void;
  onCreateBlank: () => void;
  onResumeSaved: () => void;
  onLoadPlatformer: () => void;
  onLoadTopDown: () => void;
  onImportProject: () => void;
}) {
  return (
    <div className={onClose ? 'nexus-launcher-overlay' : 'nexus-launcher-shell'}>
      <div className="nexus-launcher">
        <div className="nexus-launcher-side">
          <div className="nexus-brand">
            <div className="nexus-brand-icon">
              <Gamepad2 size={14} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Nexus 2D</p>
              <p className="text-xs font-semibold text-[var(--text)]">Project Launcher</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">Start from an empty workspace.</h1>
              <p className="mt-2 max-w-[38ch] text-[12px] leading-6 text-[var(--muted)]">
                Open an existing project, load a sample, or begin with a blank world so the editor behaves like a real engine instead of dropping you into a demo scene.
              </p>
            </div>
            <div className="space-y-2 text-[11px] text-[var(--muted)]">
              <div className="nexus-launcher-fact">Blank projects open with an empty scene and neutral grey defaults.</div>
              <div className="nexus-launcher-fact">Sample projects are optional and load into the same editor workflow.</div>
              <div className="nexus-launcher-fact">You can reopen this launcher later from the top bar.</div>
            </div>
          </div>
        </div>

        <div className="nexus-launcher-main">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Create Or Open</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--text)]">Choose how to enter the editor</div>
            </div>
            {onClose && (
              <IconButton onClick={onClose} title="Close launcher">
                <X size={15} />
              </IconButton>
            )}
          </div>

          <div className="nexus-launcher-grid">
            <LauncherCard
              title="New Blank Project"
              subtitle="Start with an empty scene, neutral grey viewport defaults and no demo objects."
              badge="Recommended"
              onClick={onCreateBlank}
            />
            <LauncherCard
              title="Import Project JSON"
              subtitle="Open an existing `.nexus2d.json` project exported from the editor."
              onClick={onImportProject}
            />
            <LauncherCard
              title="Load Platformer Sample"
              subtitle="Example side-scroller with camera follow, hazards, collectibles and goal flow."
              onClick={onLoadPlatformer}
            />
            <LauncherCard
              title="Load Top-Down Sample"
              subtitle="Example arena project with large world layout and top-down movement."
              onClick={onLoadTopDown}
            />
          </div>

          {hasSavedProject && (
            <div className="rounded-sm border border-[var(--border)] bg-[#26292e] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Saved Session</div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text)]">Resume last autosaved project</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">Continue from the last project saved into local storage.</div>
                </div>
                <button onClick={onResumeSaved} className="nexus-ghost-button">
                  <FolderOpen size={14} />
                  Resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const history = useProjectHistory(loadInitialProject());
  const project = history.project;
  const activeScene = getActiveScene(project);
  const stats = projectStats(project);

  const [sessionStarted, setSessionStarted] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState<TopMenuKey | null>(null);
  const [storedProject, setStoredProject] = useState<Project | null>(() => readStoredProject());
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(activeScene.entities[0]?.id ?? null);
  const [transformMode, setTransformMode] = useState<TransformMode>('move');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [stageViewportMode, setStageViewportMode] = useState<StageViewportMode>('world');
  const [isPlaying, setIsPlaying] = useState(false);
  const [rightTab, setRightTab] = useState<'inspector' | 'ai'>('inspector');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [isCompact, setIsCompact] = useState(window.innerWidth < 1280);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [panState, setPanState] = useState<PanState>(null);
  const [aiMode, setAiMode] = useState<'create' | 'extend'>('extend');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [aiError, setAiError] = useState('');
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [stageCanvasSize, setStageCanvasSize] = useState<{width: number; height: number} | null>(null);
  const [contentDrawerOpen, setContentDrawerOpen] = useState(false);
  const [outlinerFilter, setOutlinerFilter] = useState('');
  const [detailsFilter, setDetailsFilter] = useState('');
  const [assetFilter, setAssetFilter] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const importProjectInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const runtimeDigestRef = useRef('');
  const menuBarRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<Vector2 | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const selectedEntity = activeScene.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedTransform = selectedEntity ? getComponent<TransformComponent>(selectedEntity, ComponentType.Transform) : null;
  const selectedSprite = selectedEntity ? getComponent<SpriteComponent>(selectedEntity, ComponentType.Sprite) : null;
  const filteredScenes = project.scenes.filter((scene) => matchesFilterQuery(outlinerFilter, scene.name, scene.notes));
  const filteredEntities = activeScene.entities
    .slice()
    .sort((left, right) => right.layer - left.layer)
    .filter((entity) => matchesFilterQuery(outlinerFilter, entity.name, entity.prefab, entity.tags.join(' '), entity.layer));
  const filteredAssets = project.assets.filter((asset) => matchesFilterQuery(assetFilter, asset.name, asset.type));
  const detailsPlaceholder =
    rightTab === 'ai'
      ? 'Assistant prompt and summary live here'
      : selectedEntity
        ? `Filter ${selectedEntity.name} details`
        : `Filter ${activeScene.name} settings`;

  const launchProject = (nextProject: Project) => {
    history.reset(touchProject(nextProject));
    setSelectedEntityId(getActiveScene(nextProject).entities[0]?.id ?? null);
    setIsPlaying(false);
    setLauncherOpen(false);
    setSessionStarted(true);
    setStageViewportMode('world');
    setStoredProject(nextProject);
    setContentDrawerOpen(false);
    setOutlinerFilter('');
    setDetailsFilter('');
    setAssetFilter('');
    setRightTab('inspector');
  };

  const touchProject = (nextProject: Project) => ({
    ...nextProject,
    updatedAt: new Date().toISOString(),
  });

  const saveLocalSnapshot = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    setStoredProject(project);
  };

  const mutateProject = (mutator: (draft: Project) => void, options?: {replace?: boolean}) => {
    history.updateProject((current) => {
      const draft = cloneProject(current);
      mutator(draft);
      return touchProject(draft);
    }, {replace: options?.replace});
  };

  const mutateActiveScene = (mutator: (scene: Scene) => void, options?: {replace?: boolean}) => {
    mutateProject((draft) => {
      mutator(getActiveScene(draft));
    }, options);
  };

  const mutateSelectedEntity = (mutator: (entity: Entity) => void, options?: {replace?: boolean}) => {
    if (!selectedEntityId) {
      return;
    }

    mutateActiveScene((scene) => {
      const entity = scene.entities.find((entry) => entry.id === selectedEntityId);
      if (entity) {
        mutator(entity);
      }
    }, options);
  };

  const replaceComponent = <T extends TransformComponent | SpriteComponent | RigidBodyComponent | ColliderComponent | BehaviorComponent>(
    type: T['type'],
    updater: (component: T) => T,
    options?: {replace?: boolean},
  ) => {
    mutateSelectedEntity((entity) => {
      entity.components = entity.components.map((component) =>
        component.type === type ? updater(component as T) : component,
      );
    }, options);
  };

  const addComponentToSelection = (type: ComponentType) => {
    mutateSelectedEntity((entity) => {
      if (entity.components.some((component) => component.type === type)) {
        return;
      }

      switch (type) {
        case ComponentType.RigidBody:
          entity.components.push(createRigidBody());
          break;
        case ComponentType.Collider:
          entity.components.push(createCollider());
          break;
        case ComponentType.Behavior:
          entity.components.push(createBehavior('none'));
          break;
        case ComponentType.Script:
          entity.components.push(createScript('// deltaSeconds available here\n'));
          break;
        default:
          break;
      }
    });
  };

  const removeComponentFromSelection = (type: ComponentType) => {
    mutateSelectedEntity((entity) => {
      entity.components = entity.components.filter((component) => component.type !== type);
    });
  };

  const clampScalar = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getCanvasScreenPointFromClient = (
    clientX: number,
    clientY: number,
    options?: {clampToCanvas?: boolean},
  ): Vector2 | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();
    const safeClientX = options?.clampToCanvas ? clampScalar(clientX, bounds.left, bounds.right) : clientX;
    const safeClientY = options?.clampToCanvas ? clampScalar(clientY, bounds.top, bounds.bottom) : clientY;
    const screenX = ((safeClientX - bounds.left) / bounds.width) * canvas.width;
    const screenY = ((safeClientY - bounds.top) / bounds.height) * canvas.height;

    return {
      x: screenX,
      y: screenY,
    };
  };

  const getCanvasScreenPoint = (event: React.MouseEvent<HTMLCanvasElement>): Vector2 | null =>
    getCanvasScreenPointFromClient(event.clientX, event.clientY);

  const getWorldPoint = (event: React.MouseEvent<HTMLCanvasElement>): Vector2 | null => {
    const screenPoint = getCanvasScreenPoint(event);
    if (!screenPoint) {
      return null;
    }

    const worldPoint = engineRef.current?.screenToWorld(screenPoint.x, screenPoint.y);
    if (worldPoint) {
      return worldPoint;
    }

    return screenPoint;
  };

  const getEntityVisual = (entity: Entity) => {
    const transform = getComponent<TransformComponent>(entity, ComponentType.Transform);
    const sprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
    if (!transform || !sprite || entity.hidden) {
      return null;
    }

    const width = Math.max(1, Math.abs(sprite.width * transform.scale.x));
    const height = Math.max(1, Math.abs(sprite.height * transform.scale.y));
    const rotationRadians = (transform.rotation * Math.PI) / 180;

    return {
      entity,
      transform,
      sprite,
      width,
      height,
      rotationRadians,
    };
  };

  const worldToCanvasPoint = (point: Vector2): Vector2 | null => {
    const screenPoint = engineRef.current?.worldToScreen(point.x, point.y);
    if (!screenPoint) {
      return null;
    }

    return screenPoint;
  };

  const getSelectedTransformGizmo = () => {
    if (!selectedEntity) {
      return null;
    }

    const visual = getEntityVisual(selectedEntity);
    if (!visual) {
      return null;
    }

    const halfWidth = visual.width / 2;
    const halfHeight = visual.height / 2;
    const localCorners = [
      {x: -halfWidth, y: -halfHeight},
      {x: halfWidth, y: -halfHeight},
      {x: halfWidth, y: halfHeight},
      {x: -halfWidth, y: halfHeight},
    ];
    const corners = localCorners
      .map((corner) => {
        const rotated = rotateVector(corner, visual.rotationRadians);
        return {
          x: visual.transform.position.x + rotated.x,
          y: visual.transform.position.y + rotated.y,
        };
      })
      .map(worldToCanvasPoint);

    if (corners.some((corner) => !corner)) {
      return null;
    }

    const [northWest, northEast, southEast, southWest] = corners as [Vector2, Vector2, Vector2, Vector2];
    const topCenter = midpoint(northWest, northEast);
    const centerScreen = worldToCanvasPoint(visual.transform.position);
    if (!centerScreen) {
      return null;
    }

    const outwardX = topCenter.x - centerScreen.x;
    const outwardY = topCenter.y - centerScreen.y;
    const outwardLength = Math.hypot(outwardX, outwardY);
    const outwardNormal =
      outwardLength > 0.0001
        ? {x: outwardX / outwardLength, y: outwardY / outwardLength}
        : {x: 0, y: -1};
    const rotateHandle = {
      x: topCenter.x + outwardNormal.x * 30,
      y: topCenter.y + outwardNormal.y * 30,
    };

    return {
      corners: {northWest, northEast, southEast, southWest},
      topCenter,
      rotateHandle,
      scaleHandles: SCALE_HANDLE_DIRECTIONS.map((handle) => ({
        ...handle,
        point:
          handle.id === 'scale-nw'
            ? northWest
            : handle.id === 'scale-ne'
              ? northEast
              : handle.id === 'scale-se'
                ? southEast
                : southWest,
      })),
    };
  };

  const beginTransformDrag = (
    event: {clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void},
    entity: Entity,
    interaction: TransformInteraction,
    options?: {scaleHandle?: ScaleHandleDirection},
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const screenPoint = getCanvasScreenPointFromClient(event.clientX, event.clientY, {clampToCanvas: true});
    if (!screenPoint) {
      return;
    }

    const transform = getComponent<TransformComponent>(entity, ComponentType.Transform);
    const sprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
    if (!transform || !sprite) {
      return;
    }

    const worldPoint = engineRef.current?.screenToWorld(screenPoint.x, screenPoint.y) ?? screenPoint;
    const nextDragState: Exclude<DragState, null> = {
      entityId: entity.id,
      interaction,
      pointerStart: worldPoint,
      transformStart: structuredClone(transform),
      spriteSize: {
        x: Math.max(1, sprite.width),
        y: Math.max(1, sprite.height),
      },
    };

    if (interaction === 'rotate') {
      const pointerAngle = (Math.atan2(worldPoint.y - transform.position.y, worldPoint.x - transform.position.x) * 180) / Math.PI;
      nextDragState.rotationPointerOffset = pointerAngle - transform.rotation;
    }

    if (interaction === 'scale' && options?.scaleHandle) {
      nextDragState.scaleHandle = options.scaleHandle;
    }

    setDragState(nextDragState);
  };

  const selectedTransformGizmo = !isPlaying && selectedEntity && selectedTransform && selectedSprite ? getSelectedTransformGizmo() : null;

  const focusStageViewport = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && activeElement !== canvas) {
      const editableElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      if (editableElement && typeof (activeElement as HTMLElement).blur === 'function') {
        (activeElement as HTMLElement).blur();
      }
    }

    if (document.activeElement !== canvas) {
      canvas.focus({preventScroll: true});
    }
  };

  const clearPendingDragFrame = () => {
    dragPointerRef.current = null;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  };

  const findEntityAtPoint = (point: Vector2) =>
    [...activeScene.entities]
      .sort((left, right) => right.layer - left.layer)
      .find((entity) => {
        const visual = getEntityVisual(entity);
        if (!visual) {
          return false;
        }

        const offset = {
          x: point.x - visual.transform.position.x,
          y: point.y - visual.transform.position.y,
        };
        const localPoint = rotateVector(offset, -visual.rotationRadians);
        return Math.abs(localPoint.x) <= visual.width / 2 && Math.abs(localPoint.y) <= visual.height / 2;
      });

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const primaryModifier = event.ctrlKey || event.metaKey;
    if (
      !isPlaying &&
      stageViewportMode === 'world' &&
      event.button === 0 &&
      primaryModifier &&
      runtimeSnapshot
    ) {
      const screenPoint = getCanvasScreenPoint(event);
      const point = getWorldPoint(event);
      if (point && screenPoint) {
        const cameraFrame = runtimeSnapshot.camera;
        const insideCameraFrame =
          point.x >= cameraFrame.x &&
          point.x <= cameraFrame.x + cameraFrame.width &&
          point.y >= cameraFrame.y &&
          point.y <= cameraFrame.y + cameraFrame.height;

        if (insideCameraFrame) {
          event.preventDefault();
          engineRef.current?.panEditor(0, 0);
          const editorFrame = engineRef.current?.getEditorCameraFrame();
          setPanState({
            mode: 'camera-drag',
            screenStart: screenPoint,
            cameraStart: {
              x: activeScene.settings.cameraStart.x,
              y: activeScene.settings.cameraStart.y,
            },
            frameSize: {
              x: cameraFrame.width,
              y: cameraFrame.height,
            },
            zoomStart: Math.max(0.0001, editorFrame?.zoom ?? 1),
          });
          return;
        }
      }
    }

    const panMouseButton = event.button === 1 || event.button === 2;
    if (panMouseButton) {
      event.preventDefault();
      const screenPoint = getCanvasScreenPoint(event);
      if (screenPoint) {
        setPanState({mode: 'editor-pan', screenStart: screenPoint});
      }
      return;
    }

    if (isPlaying) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const point = getWorldPoint(event);
    if (!point) {
      return;
    }

    const hit = findEntityAtPoint(point);
    setSelectedEntityId(hit?.id ?? null);
    if (hit) {
      setRightTab('inspector');
      if (isCompact) {
        setRightSidebarOpen(true);
      }
    }

    if (!hit || hit.locked) {
      return;
    }

    if (transformMode !== 'move') {
      return;
    }

    beginTransformDrag(event, hit, 'move');
  };

  const handleCanvasPointerMove = useEffectEvent((clientX: number, clientY: number) => {
    if (panState?.mode === 'editor-pan') {
      const screenPoint = getCanvasScreenPointFromClient(clientX, clientY);
      if (!screenPoint) {
        return;
      }

      engineRef.current?.panEditor(screenPoint.x - panState.screenStart.x, screenPoint.y - panState.screenStart.y);
      setPanState({mode: 'editor-pan', screenStart: screenPoint});
      return;
    }

    if (panState?.mode === 'camera-drag') {
      const screenPoint = getCanvasScreenPointFromClient(clientX, clientY, {clampToCanvas: true});
      if (!screenPoint) {
        return;
      }

      const dx = (screenPoint.x - panState.screenStart.x) / panState.zoomStart;
      const dy = (screenPoint.y - panState.screenStart.y) / panState.zoomStart;
      const maxCameraStartX = Math.max(0, activeScene.settings.worldSize.x - panState.frameSize.x);
      const maxCameraStartY = Math.max(0, activeScene.settings.worldSize.y - panState.frameSize.y);
      const nextCameraStartX = Math.round(clampScalar(panState.cameraStart.x + dx, 0, maxCameraStartX));
      const nextCameraStartY = Math.round(clampScalar(panState.cameraStart.y + dy, 0, maxCameraStartY));

      if (
        nextCameraStartX !== activeScene.settings.cameraStart.x ||
        nextCameraStartY !== activeScene.settings.cameraStart.y
      ) {
        mutateActiveScene(
          (scene) => {
            scene.settings.cameraStart.x = nextCameraStartX;
            scene.settings.cameraStart.y = nextCameraStartY;
          },
          {replace: true},
        );
      }
      return;
    }

    if (!dragState || !selectedEntity || dragState.entityId !== selectedEntity.id) {
      return;
    }

    dragPointerRef.current = {x: clientX, y: clientY};
    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const pending = dragPointerRef.current;
      dragPointerRef.current = null;

      if (!pending || !dragState || !selectedEntity || dragState.entityId !== selectedEntity.id) {
        return;
      }

      const screenPoint = getCanvasScreenPointFromClient(pending.x, pending.y, {clampToCanvas: true});
      if (!screenPoint) {
        return;
      }

      const point = engineRef.current?.screenToWorld(screenPoint.x, screenPoint.y) ?? screenPoint;
      const selectedTransform = getComponent<TransformComponent>(selectedEntity, ComponentType.Transform);
      if (!point || !selectedTransform) {
        return;
      }

      const dx = point.x - dragState.pointerStart.x;
      const dy = point.y - dragState.pointerStart.y;

      if (dragState.interaction === 'move') {
        let position = {
          x: dragState.transformStart.position.x + dx,
          y: dragState.transformStart.position.y + dy,
        };

        if (activeScene.settings.snapToGrid) {
          position = snapPoint(position, activeScene.settings.gridSize);
        }

        if (
          Math.abs(position.x - selectedTransform.position.x) < 0.01 &&
          Math.abs(position.y - selectedTransform.position.y) < 0.01
        ) {
          return;
        }

        replaceComponent<TransformComponent>(ComponentType.Transform, (component) => ({...component, position}), {replace: true});
        return;
      }

      if (dragState.interaction === 'rotate') {
        const pointerAngle =
          (Math.atan2(
            point.y - dragState.transformStart.position.y,
            point.x - dragState.transformStart.position.x,
          ) *
            180) /
          Math.PI;
        const rotation = pointerAngle - (dragState.rotationPointerOffset ?? 0);

        if (Math.abs(rotation - selectedTransform.rotation) < 0.05) {
          return;
        }

        replaceComponent<TransformComponent>(ComponentType.Transform, (component) => ({...component, rotation}), {replace: true});
        return;
      }

      if (!dragState.scaleHandle) {
        return;
      }

      const localPoint = rotateVector(
        {
          x: point.x - dragState.transformStart.position.x,
          y: point.y - dragState.transformStart.position.y,
        },
        (-dragState.transformStart.rotation * Math.PI) / 180,
      );
      const scale = {
        x: Math.max(0.2, (localPoint.x * dragState.scaleHandle.x) / (dragState.spriteSize.x / 2)),
        y: Math.max(0.2, (localPoint.y * dragState.scaleHandle.y) / (dragState.spriteSize.y / 2)),
      };
      if (
        Math.abs(scale.x - selectedTransform.scale.x) < 0.005 &&
        Math.abs(scale.y - selectedTransform.scale.y) < 0.005
      ) {
        return;
      }

      replaceComponent<TransformComponent>(
        ComponentType.Transform,
        (component) => ({
          ...component,
          scale,
        }),
        {replace: true},
      );
    });
  });

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    handleCanvasPointerMove(event.clientX, event.clientY);
  };

  const handleCanvasMouseUp = () => {
    clearPendingDragFrame();
    setDragState(null);
    setPanState(null);
  };

  const handleCanvasContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  const handleCanvasWheel = useEffectEvent((event: WheelEvent) => {
    if (launcherOpen || dragState) {
      return;
    }

    event.preventDefault();
    const screenPoint = getCanvasScreenPointFromClient(event.clientX, event.clientY);
    if (!screenPoint) {
      return;
    }
    engineRef.current?.adjustEditorZoom(event.deltaY, screenPoint.x, screenPoint.y);
  });

  const addPrefab = (prefab: EntityPrefab) => {
    const viewportWidth = viewportMode === 'mobile' ? 390 : Math.max(1, Math.round(stageCanvasSize?.width ?? 1280));
    const viewportHeight = viewportMode === 'mobile' ? 844 : Math.max(1, Math.round(stageCanvasSize?.height ?? 820));
    const cameraFrameWidth = Math.min(viewportWidth, activeScene.settings.worldSize.x);
    const cameraFrameHeight = Math.min(viewportHeight, activeScene.settings.worldSize.y);
    const maxCameraStartX = Math.max(0, activeScene.settings.worldSize.x - cameraFrameWidth);
    const maxCameraStartY = Math.max(0, activeScene.settings.worldSize.y - cameraFrameHeight);
    const cameraFrame = {
      x: clampScalar(activeScene.settings.cameraStart.x, 0, maxCameraStartX),
      y: clampScalar(activeScene.settings.cameraStart.y, 0, maxCameraStartY),
      width: cameraFrameWidth,
      height: cameraFrameHeight,
    };

    const selectedAnchor = selectedEntity
      ? getComponent<TransformComponent>(selectedEntity, ComponentType.Transform)?.position
      : null;
    const anchor = selectedAnchor ?? {
      x: cameraFrame.x + cameraFrame.width / 2,
      y: cameraFrame.y + cameraFrame.height / 2,
    };

    let position = selectedAnchor
      ? {x: anchor.x + 64, y: anchor.y - 32}
      : {x: anchor.x, y: anchor.y};
    if (activeScene.settings.snapToGrid) {
      position = snapPoint(position, activeScene.settings.gridSize);
    }

    const entity = createEntityFromPrefab(prefab, position);
    const entityTransform = getComponent<TransformComponent>(entity, ComponentType.Transform);
    if (entityTransform) {
      const entitySprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
      const halfWidth = Math.max(
        8,
        ((entitySprite?.width ?? 64) * Math.max(0.2, Math.abs(entityTransform.scale.x))) / 2,
      );
      const halfHeight = Math.max(
        8,
        ((entitySprite?.height ?? 64) * Math.max(0.2, Math.abs(entityTransform.scale.y))) / 2,
      );

      const minX = cameraFrame.x + halfWidth;
      const maxX = cameraFrame.x + cameraFrame.width - halfWidth;
      const minY = cameraFrame.y + halfHeight;
      const maxY = cameraFrame.y + cameraFrame.height - halfHeight;

      entityTransform.position.x =
        minX <= maxX ? clampScalar(entityTransform.position.x, minX, maxX) : cameraFrame.x + cameraFrame.width / 2;
      entityTransform.position.y =
        minY <= maxY ? clampScalar(entityTransform.position.y, minY, maxY) : cameraFrame.y + cameraFrame.height / 2;
    }

    mutateActiveScene((scene) => {
      scene.entities.push(entity);
    });
    setSelectedEntityId(entity.id);
    setRightTab('inspector');
  };

  const duplicateSelection = () => {
    if (!selectedEntity) {
      return;
    }

    const copy = duplicateEntity(selectedEntity);
    mutateActiveScene((scene) => {
      scene.entities.push(copy);
    });
    setSelectedEntityId(copy.id);
  };

  const deleteSelection = () => {
    if (!selectedEntity) {
      return;
    }

    mutateActiveScene((scene) => {
      scene.entities = scene.entities.filter((entity) => entity.id !== selectedEntity.id);
    });
    setSelectedEntityId(null);
  };

  const createSceneFromTemplate = (template: 'blank' | 'platformer' | 'topdown') => {
    let scene: Scene;

    switch (template) {
      case 'platformer':
        scene = createPlatformerTemplate();
        break;
      case 'topdown':
        scene = createTopDownTemplate();
        break;
      default:
        scene = createBlankScene(`Scene ${project.scenes.length + 1}`);
        break;
    }

    mutateProject((draft) => {
      draft.scenes.push(scene);
      draft.activeSceneId = scene.id;
    });
    setSelectedEntityId(scene.entities[0]?.id ?? null);
    setIsPlaying(false);
  };

  const openAssistant = (mode?: 'create' | 'extend') => {
    if (mode) {
      setAiMode(mode);
    }
    setRightTab('ai');
    setRightSidebarOpen(true);
  };

  const switchScene = (sceneId: string) => {
    mutateProject((draft) => {
      draft.activeSceneId = sceneId;
    });
    const nextScene = project.scenes.find((scene) => scene.id === sceneId);
    setSelectedEntityId(nextScene?.entities[0]?.id ?? null);
    setIsPlaying(false);
  };

  const deleteActiveScene = () => {
    const currentIndex = project.scenes.findIndex((scene) => scene.id === activeScene.id);
    const replacementScene = createBlankScene('Scene 1');
    const nextScene =
      project.scenes.length <= 1
        ? replacementScene
        : project.scenes[currentIndex === project.scenes.length - 1 ? currentIndex - 1 : currentIndex + 1] ?? project.scenes[0];

    mutateProject((draft) => {
      if (draft.scenes.length <= 1) {
        draft.scenes = [replacementScene];
        draft.activeSceneId = replacementScene.id;
        return;
      }

      draft.scenes = draft.scenes.filter((scene) => scene.id !== activeScene.id);
      draft.activeSceneId = nextScene.id;
    });

    setSelectedEntityId(nextScene.entities[0]?.id ?? null);
    setIsPlaying(false);
  };

  const captureCameraStart = () => {
    const viewFrame = engineRef.current?.getEditorCameraFrame();
    if (!viewFrame) {
      return;
    }

    mutateActiveScene((scene) => {
      scene.settings.cameraStart = {
        x: Math.round(viewFrame.x),
        y: Math.round(viewFrame.y),
      };
    });
  };

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}.nexus2d.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importProjectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const nextProject = normalizeProject(JSON.parse(text), createDefaultProject());
    launchProject(nextProject);
    event.target.value = '';
  };

  const importAssetFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      mutateProject((draft) => {
        draft.assets.push({
          id: `asset-${Date.now()}`,
          name: file.name,
          type: 'image',
          url,
        });
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const runAiGeneration = async () => {
    if (!aiPrompt.trim()) {
      setAiStatus('error');
      setAiError('צריך לכתוב בקשה ל־AI לפני השליחה.');
      return;
    }

    setAiStatus('loading');
    setAiError('');

    try {
      const response = await fetch('/api/ai/generate-project', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          mode: aiMode,
          prompt: aiPrompt.trim(),
          project,
        }),
      });

      const payload = (await response.json()) as AIResponsePayload & {error?: string};
      if (!response.ok) {
        throw new Error(payload.error || 'Vertex AI request failed.');
      }

      const normalized = normalizeAiResponse(payload, project);
      setAiSummary(normalized.summary);
      setAiNotes(normalized.notes);

      startTransition(() => {
        history.setProject(touchProject(normalized.project));
        setSelectedEntityId(getActiveScene(normalized.project).entities[0]?.id ?? null);
        setIsPlaying(false);
      });

      setAiStatus('idle');
      setRightTab('inspector');
    } catch (error) {
      setAiStatus('error');
      setAiError(error instanceof Error ? error.message : 'Unknown AI error.');
      setRightTab('ai');
    }
  };

  const handleRuntimeControls = (input: string, value: boolean) => {
    engineRef.current?.setInput(input, value);
  };

  const handleResize = useEffectEvent(() => {
    const compact = window.innerWidth < 1280;
    setIsCompact(compact);
    setLeftSidebarOpen(!compact);
    setRightSidebarOpen(!compact);
  });

  const fitStageCanvas = useEffectEvent(() => {
    const shell = stageShellRef.current;
    if (!shell) {
      return;
    }

    const styles = window.getComputedStyle(shell);
    const availableWidth = Math.max(
      1,
      shell.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight),
    );
    const availableHeight = Math.max(
      1,
      shell.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom),
    );
    const setCanvasSizeIfChanged = (width: number, height: number) => {
      setStageCanvasSize((previous) => {
        if (previous?.width === width && previous?.height === height) {
          return previous;
        }

        return {width, height};
      });
    };

    if (viewportMode === 'mobile') {
      const baseWidth = 390;
      const baseHeight = 844;
      const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);

      setCanvasSizeIfChanged(Math.max(1, Math.floor(baseWidth * scale)), Math.max(1, Math.floor(baseHeight * scale)));
      return;
    }

    setCanvasSizeIfChanged(availableWidth, availableHeight);
  });

  const handleHotkeys = useEffectEvent((event: KeyboardEvent) => {
    if (!sessionStarted || launcherOpen) {
      return;
    }

    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    const primary = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (primary && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
      return;
    }

    if (primary && key === 'y') {
      event.preventDefault();
      history.redo();
      return;
    }

    if (primary && key === 's') {
      event.preventDefault();
      exportProject();
      return;
    }

    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (selectedEntity) {
        deleteSelection();
      }
      return;
    }

    if (key === 'w') {
      setTransformMode('move');
    } else if (key === 'e') {
      setTransformMode('rotate');
    } else if (key === 'r') {
      setTransformMode('scale');
    } else if (key === ' ') {
      event.preventDefault();
      setIsPlaying((playing) => !playing);
    }
  });

  useEffect(() => {
    if (!sessionStarted || !canvasRef.current) {
      return;
    }

    engineRef.current = new GameEngine(canvasRef.current);
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [sessionStarted]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleHotkeys, true);
    return () => window.removeEventListener('keydown', handleHotkeys, true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!sessionStarted || !canvas) {
      return;
    }

    const wheelListener = (event: WheelEvent) => handleCanvasWheel(event);
    canvas.addEventListener('wheel', wheelListener, {passive: false});

    return () => {
      canvas.removeEventListener('wheel', wheelListener);
    };
  }, [sessionStarted]);

  useEffect(() => {
    if (!dragState && !panState) {
      return;
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      handleCanvasPointerMove(event.clientX, event.clientY);
    };
    const handleWindowMouseUp = () => {
      clearPendingDragFrame();
      setDragState(null);
      setPanState(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowMouseUp);
    };
  }, [dragState, panState]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveMenu(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    setStoredProject(project);
  }, [project, sessionStarted]);

  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    engine.setProject(project);
  }, [project, sessionStarted]);

  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    engine.setSelectedEntity(selectedEntityId, transformMode);
  }, [selectedEntityId, transformMode, sessionStarted]);

  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    engine.setEditorViewportMode(stageViewportMode);
  }, [stageViewportMode, sessionStarted]);

  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    if (isPlaying) {
      engine.start();
    } else {
      engine.stop();
    }
  }, [isPlaying, sessionStarted]);

  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const width = viewportMode === 'mobile' ? 390 : Math.max(1, Math.round(stageCanvasSize?.width ?? 1280));
    const height = viewportMode === 'mobile' ? 844 : Math.max(1, Math.round(stageCanvasSize?.height ?? 820));
    engine.resize(width, height);
  }, [viewportMode, stageCanvasSize, sessionStarted]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = engineRef.current?.getRuntimeSnapshot();
      const digest = snapshot ? JSON.stringify(snapshot) : '';
      if (digest !== runtimeDigestRef.current) {
        runtimeDigestRef.current = digest;
        setRuntimeSnapshot(snapshot ?? null);
      }
    }, 160);

    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (!sessionStarted) {
      return;
    }

    fitStageCanvas();
    const shell = stageShellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      fitStageCanvas();
    });

    observer.observe(shell);
    return () => observer.disconnect();
  }, [sessionStarted, viewportMode]);

  useEffect(() => {
    if (selectedEntityId && !activeScene.entities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(activeScene.entities[0]?.id ?? null);
    }
  }, [activeScene, selectedEntityId]);

  useEffect(() => {
    const readHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const payload = (await response.json()) as AiHealth;
        setAiHealth(payload);
      } catch {
        setAiHealth({ok: false});
      }
    };

    void readHealth();
  }, []);

  if (!sessionStarted) {
    return (
      <>
        <input
          ref={importProjectInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={importProjectFile}
        />
        <ProjectLauncher
          hasSavedProject={Boolean(storedProject)}
          onCreateBlank={() => launchProject(createBlankProject())}
          onResumeSaved={() => {
            if (storedProject) {
              launchProject(storedProject);
            }
          }}
          onLoadPlatformer={() => launchProject(createSampleProject('platformer'))}
          onLoadTopDown={() => launchProject(createSampleProject('topdown'))}
          onImportProject={() => importProjectInputRef.current?.click()}
        />
      </>
    );
  }

  const closeMenu = () => setActiveMenu(null);
  const deleteActionLabel = selectedEntity ? 'Delete Actor' : project.scenes.length > 1 ? 'Delete Scene' : 'Reset Scene';
  const menuActions: Record<TopMenuKey, MenuAction[]> = {
    file: [
      {
        label: 'New Blank Project',
        hint: 'Reset to a clean empty project.',
        onSelect: () => {
          closeMenu();
          launchProject(createBlankProject());
        },
      },
      {
        label: 'Projects Launcher',
        hint: 'Open launcher to load, import or resume projects.',
        onSelect: () => {
          closeMenu();
          setLauncherOpen(true);
        },
      },
      {
        label: 'Import Project',
        hint: 'Load an existing .nexus2d.json file.',
        shortcut: 'Ctrl+O',
        onSelect: () => {
          closeMenu();
          importProjectInputRef.current?.click();
        },
      },
      {
        label: 'Export Project',
        hint: 'Write the current project to JSON.',
        shortcut: 'Ctrl+S',
        onSelect: () => {
          closeMenu();
          exportProject();
        },
      },
      {
        label: 'Save Local Snapshot',
        hint: 'Persist the current state to local storage.',
        onSelect: () => {
          closeMenu();
          saveLocalSnapshot();
        },
      },
    ],
    edit: [
      {
        label: 'Undo',
        hint: 'Step back one editor action.',
        shortcut: 'Ctrl+Z',
        disabled: !history.canUndo,
        onSelect: () => {
          closeMenu();
          history.undo();
        },
      },
      {
        label: 'Redo',
        hint: 'Restore the last undone action.',
        shortcut: 'Ctrl+Y',
        disabled: !history.canRedo,
        onSelect: () => {
          closeMenu();
          history.redo();
        },
      },
      {
        label: 'Duplicate Selection',
        hint: 'Create a copy of the selected entity.',
        disabled: !selectedEntity,
        onSelect: () => {
          closeMenu();
          duplicateSelection();
        },
      },
      {
        label: 'Delete Selection',
        hint: 'Remove the selected entity from the active scene.',
        disabled: !selectedEntity,
        onSelect: () => {
          closeMenu();
          deleteSelection();
        },
      },
    ],
    scene: [
      {
        label: 'New Blank Scene',
        hint: 'Add a new empty scene to the project.',
        onSelect: () => {
          closeMenu();
          createSceneFromTemplate('blank');
        },
      },
      {
        label: 'Add Platformer Scene',
        hint: 'Append a sample platformer scene to the project.',
        onSelect: () => {
          closeMenu();
          createSceneFromTemplate('platformer');
        },
      },
      {
        label: 'Add Top-Down Scene',
        hint: 'Append a sample top-down scene to the project.',
        onSelect: () => {
          closeMenu();
          createSceneFromTemplate('topdown');
        },
      },
      {
        label: project.scenes.length > 1 ? 'Delete Active Scene' : 'Reset Active Scene',
        hint:
          project.scenes.length > 1
            ? 'Remove the current scene and switch to the next available scene.'
            : 'Replace the current scene with a fresh blank scene so the project stays valid.',
        onSelect: () => {
          closeMenu();
          deleteActiveScene();
        },
      },
    ],
    window: [
      {
        label: leftSidebarOpen ? 'Hide Outliner' : 'Show Outliner',
        hint: 'Toggle the left editor panel.',
        onSelect: () => {
          closeMenu();
          setLeftSidebarOpen((open) => !open);
        },
      },
      {
        label: rightSidebarOpen ? 'Hide Details' : 'Show Details',
        hint: 'Toggle the right editor panel.',
        onSelect: () => {
          closeMenu();
          setRightSidebarOpen((open) => !open);
        },
      },
      {
        label: contentDrawerOpen ? 'Hide Content Drawer' : 'Show Content Drawer',
        hint: 'Toggle the bottom asset browser.',
        onSelect: () => {
          closeMenu();
          setContentDrawerOpen((open) => !open);
        },
      },
      {
        label: stageViewportMode === 'world' ? 'Switch To Camera View' : 'Switch To World View',
        hint: 'Change between full world edit view and in-game camera preview.',
        onSelect: () => {
          closeMenu();
          setStageViewportMode((mode) => (mode === 'world' ? 'camera' : 'world'));
        },
      },
    ],
    assistant: [
      {
        label: 'Open Assistant',
        hint: 'Show the AI panel in the right sidebar.',
        onSelect: () => {
          closeMenu();
          openAssistant();
        },
      },
      {
        label: 'Create Full Game',
        hint: 'Prepare the assistant to generate a project from scratch.',
        onSelect: () => {
          closeMenu();
          openAssistant('create');
        },
      },
      {
        label: 'Edit Current Game',
        hint: 'Prepare the assistant to modify the current project.',
        onSelect: () => {
          closeMenu();
          openAssistant('extend');
        },
      },
    ],
  };

  return (
    <div className="nexus-shell">
      <input
        ref={importProjectInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={importProjectFile}
      />
      <input
        ref={assetInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={importAssetFile}
      />

      <header className="nexus-topbar">
        <div className="flex items-center gap-3 min-w-0">
          <div className="nexus-brand">
            <div className="nexus-brand-icon">
              <Gamepad2 size={14} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Nexus 2D</p>
              <p className="text-xs font-semibold text-[var(--text)]">{project.name}</p>
            </div>
          </div>
          {!isCompact && (
            <div ref={menuBarRef} className="nexus-menu-strip">
              {(Object.keys(menuActions) as TopMenuKey[]).map((menuKey) => (
                <div key={menuKey} className="nexus-menu-group">
                  <TopMenuTrigger
                    label={menuKey[0].toUpperCase() + menuKey.slice(1)}
                    active={activeMenu === menuKey}
                    onClick={() => setActiveMenu((current) => (current === menuKey ? null : menuKey))}
                  />
                  {activeMenu === menuKey && <TopMenuPanel actions={menuActions[menuKey]} />}
                </div>
              ))}
            </div>
          )}
          {!isCompact && (
            <div className="nexus-project-stats">
              <RuntimeBadge label="Scn">{stats.sceneCount}</RuntimeBadge>
              <RuntimeBadge label="Ent">{stats.entityCount}</RuntimeBadge>
              <RuntimeBadge label="Beh">{stats.behaviorCount}</RuntimeBadge>
              <RuntimeBadge label="Ast">{stats.assetCount}</RuntimeBadge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setLauncherOpen(true)} className="nexus-ghost-button">
            <FolderOpen size={14} />
            Projects
          </button>
          {isCompact && (
            <>
              <IconButton onClick={() => setLeftSidebarOpen((open) => !open)} title="Toggle left panel">
                <Layers3 size={16} />
              </IconButton>
              <IconButton onClick={() => setRightSidebarOpen((open) => !open)} title="Toggle right panel">
                <Settings2 size={16} />
              </IconButton>
            </>
          )}
          <IconButton onClick={history.undo} title="Undo" disabled={!history.canUndo}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton onClick={history.redo} title="Redo" disabled={!history.canRedo}>
            <Redo2 size={16} />
          </IconButton>
          <IconButton onClick={() => importProjectInputRef.current?.click()} title="Import project">
            <FolderOpen size={16} />
          </IconButton>
          <IconButton onClick={exportProject} title="Export project">
            <Download size={16} />
          </IconButton>
          <IconButton onClick={() => localStorage.setItem(STORAGE_KEY, JSON.stringify(project))} title="Save local snapshot">
            <Save size={16} />
          </IconButton>
          <div className="flex items-center gap-1 rounded-sm border border-[var(--border)] bg-[var(--chrome-panel)] p-0.5">
            <ModeButton active={viewportMode === 'desktop'} onClick={() => setViewportMode('desktop')}>
              <Monitor size={15} />
            </ModeButton>
            <ModeButton active={viewportMode === 'mobile'} onClick={() => setViewportMode('mobile')}>
              <Smartphone size={15} />
            </ModeButton>
          </div>
          <button
            onClick={() => setIsPlaying((playing) => !playing)}
            className={`nexus-play-button ${
              isPlaying ? 'nexus-play-button-active' : ''
            }`}
          >
            <span className="flex items-center gap-2">
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isPlaying ? 'Stop' : 'Simulate'}
            </span>
          </button>
        </div>
      </header>

      <main className="nexus-workspace">
        {leftSidebarOpen && (
          <motion.aside
            initial={{x: -24, opacity: 0}}
            animate={{x: 0, opacity: 1}}
            className={`nexus-panel ${isCompact ? 'nexus-panel-floating-left' : 'nexus-panel-left'}`}
          >
            <PanelHeader
              icon={<Layers3 size={16} />}
              title="Outliner"
              actions={
                isCompact ? (
                  <IconButton onClick={() => setLeftSidebarOpen(false)} title="Close">
                    <X size={16} />
                  </IconButton>
                ) : undefined
              }
            />

            <div className="nexus-panel-search">
              <input
                value={outlinerFilter}
                onChange={(event) => setOutlinerFilter(event.target.value)}
                placeholder="Filter scenes / actors"
                className="nexus-input"
              />
            </div>

            <div className="nexus-panel-body">
              <SectionCard title="Levels" subtitle="Templates and stage switching">
                <div className="flex flex-wrap gap-2">
                  <PillButton onClick={() => createSceneFromTemplate('blank')}>Blank</PillButton>
                  <PillButton onClick={() => createSceneFromTemplate('platformer')}>Platformer</PillButton>
                  <PillButton onClick={() => createSceneFromTemplate('topdown')}>Top-Down</PillButton>
                </div>
                <div className="mt-3 space-y-2">
                  {filteredScenes.map((scene) => (
                    <div
                      key={scene.id}
                      onClick={() => switchScene(scene.id)}
                      className={`flex w-full items-start justify-between gap-2 rounded-sm border px-2.5 py-2 text-left ${
                        scene.id === project.activeSceneId
                          ? 'border-[#5b6068] bg-[#393d44] text-[var(--text)]'
                          : 'border-[var(--border)] bg-[#26282c] text-[var(--muted)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold">{scene.name}</div>
                            <div className="text-[11px] opacity-80">{scene.notes || 'No scene notes yet.'}</div>
                          </div>
                          <Map size={16} className="shrink-0" />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (scene.id === activeScene.id) {
                            deleteActiveScene();
                            return;
                          }

                          const replacementScene = createBlankScene('Scene 1');
                          const nextScene = project.scenes.find((entry) => entry.id !== scene.id) ?? replacementScene;

                          mutateProject((draft) => {
                            if (draft.scenes.length <= 1) {
                              draft.scenes = [replacementScene];
                              draft.activeSceneId = replacementScene.id;
                              return;
                            }

                            draft.scenes = draft.scenes.filter((entry) => entry.id !== scene.id);
                            if (draft.activeSceneId === scene.id) {
                              draft.activeSceneId = nextScene.id;
                            }
                          });

                          if (project.activeSceneId === scene.id) {
                            setSelectedEntityId(nextScene.entities[0]?.id ?? null);
                            setIsPlaying(false);
                          }
                        }}
                        className="rounded-sm p-1.5 text-[var(--muted)] hover:bg-[#2e3137] hover:text-[var(--text)]"
                        title={`Delete ${scene.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {filteredScenes.length === 0 && <div className="nexus-section-empty">No scenes match the current filter.</div>}
                </div>
              </SectionCard>

              <SectionCard title="Place Actors" subtitle="Engine-ready entities">
                <div className="grid grid-cols-2 gap-2">
                  {PREFABS.map((entry) => (
                    <button
                      key={entry.prefab}
                      onClick={() => addPrefab(entry.prefab)}
                      className="rounded-sm border border-[var(--border)] bg-[#26282c] px-2.5 py-2 text-left"
                    >
                      <div className="text-[12px] font-semibold text-[var(--text)]">{entry.label}</div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{entry.hint}</div>
                    </button>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="World Outliner" subtitle="Active scene objects">
                <div className="space-y-2">
                  {filteredEntities.map((entity) => (
                      <div
                        key={entity.id}
                        onClick={() => {
                          setSelectedEntityId(entity.id);
                          setRightTab('inspector');
                          if (isCompact) setRightSidebarOpen(true);
                        }}
                        className={`flex w-full items-center justify-between rounded-sm border px-2.5 py-2 text-left ${
                          entity.id === selectedEntityId
                            ? 'border-[#5b6068] bg-[#393d44] text-[var(--text)]'
                            : 'border-[var(--border)] bg-[#26282c] text-[var(--muted)]'
                        }`}
                      >
                        <div>
                          <div className="text-[12px] font-semibold">{entity.name}</div>
                          <div className="text-[10px] uppercase tracking-[0.12em] opacity-70">
                            {entity.prefab} • layer {entity.layer}
                          </div>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            mutateActiveScene((scene) => {
                              scene.entities = scene.entities.filter((entry) => entry.id !== entity.id);
                            });
                            if (selectedEntityId === entity.id) {
                              setSelectedEntityId(null);
                            }
                          }}
                          className="rounded-sm p-1.5 text-[var(--muted)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  {filteredEntities.length === 0 && <div className="nexus-section-empty">No actors match the current filter.</div>}
                </div>
              </SectionCard>
            </div>
          </motion.aside>
        )}

        <section className="nexus-center">
          <div className="nexus-stage-toolbar">
            <div className="flex items-center gap-2">
              <ModeButton active={transformMode === 'move'} onClick={() => setTransformMode('move')} title="Move">
                <Move size={15} />
              </ModeButton>
              <ModeButton active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} title="Rotate">
                <RotateCcw size={15} />
              </ModeButton>
              <ModeButton active={transformMode === 'scale'} onClick={() => setTransformMode('scale')} title="Scale">
                <Maximize2 size={15} />
              </ModeButton>
              <div className="flex items-center gap-1 rounded-sm border border-[var(--border)] bg-[var(--chrome-panel)] p-0.5">
                <ModeButton active={stageViewportMode === 'world'} onClick={() => setStageViewportMode('world')}>
                  <span className="px-0.5 text-[10px] uppercase tracking-[0.12em]">World</span>
                </ModeButton>
                <ModeButton active={stageViewportMode === 'camera'} onClick={() => setStageViewportMode('camera')}>
                  <span className="px-0.5 text-[10px] uppercase tracking-[0.12em]">Camera</span>
                </ModeButton>
              </div>
              <div className="nexus-toolbar-label">
                Scene: <span className="font-semibold text-[var(--text)]">{activeScene.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={duplicateSelection} className="nexus-ghost-button">
                <Copy size={15} />
                Duplicate
              </button>
              <button
                onClick={() => {
                  if (selectedEntity) {
                    deleteSelection();
                  } else {
                    deleteActiveScene();
                  }
                }}
                className="nexus-ghost-button danger"
              >
                <Trash2 size={15} />
                {deleteActionLabel}
              </button>
            </div>
          </div>

          <div className="nexus-stage-meta">
            <div className="flex flex-wrap items-center gap-2">
              <StagePill label="Mode" value={runtimeSnapshot?.mode ?? (isPlaying ? 'play' : 'editor')} />
              <StagePill label="Stage View" value={stageViewportMode} />
              <StagePill label="Device" value={viewportMode} />
              <StagePill label="World" value={`${activeScene.settings.worldSize.x} x ${activeScene.settings.worldSize.y}`} />
              <StagePill label="Camera" value={`${runtimeSnapshot?.camera.width ?? 0} x ${runtimeSnapshot?.camera.height ?? 0}`} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StagePill label="Grid" value={activeScene.settings.gridSize} />
              <StagePill label="Snap" value={activeScene.settings.snapToGrid ? 'on' : 'off'} />
              <StagePill label="Follow" value={activeScene.settings.cameraFollowPlayer ? 'on' : 'off'} />
              <StagePill label="Gravity" value={`${activeScene.settings.gravity.x}, ${activeScene.settings.gravity.y}`} />
              <StagePill label="Entities" value={activeScene.entities.length} />
            </div>
          </div>

          <div ref={stageShellRef} className="nexus-stage-shell" onPointerDownCapture={focusStageViewport}>
            <motion.div
              className={`nexus-canvas-frame ${panState ? 'is-panning' : ''} ${viewportMode === 'mobile' ? 'nexus-canvas-mobile' : 'nexus-canvas-desktop'}`}
              style={
                stageCanvasSize
                  ? {
                      width: `${stageCanvasSize.width}px`,
                      height: `${stageCanvasSize.height}px`,
                    }
                  : undefined
              }
            >
              <canvas
                ref={canvasRef}
                tabIndex={0}
                width={viewportMode === 'mobile' ? 390 : Math.max(1, Math.round(stageCanvasSize?.width ?? 1280))}
                height={viewportMode === 'mobile' ? 844 : Math.max(1, Math.round(stageCanvasSize?.height ?? 820))}
                className={`h-full w-full rounded-[inherit] ${panState ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                onContextMenu={handleCanvasContextMenu}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
              />

              {selectedTransformGizmo && (
                <div className="nexus-transform-gizmo" aria-hidden="true">
                  <svg className="nexus-transform-gizmo-svg" viewBox={`0 0 ${stageCanvasSize?.width ?? 0} ${stageCanvasSize?.height ?? 0}`}>
                    <polygon
                      className="nexus-transform-gizmo-outline"
                      points={[
                        `${selectedTransformGizmo.corners.northWest.x},${selectedTransformGizmo.corners.northWest.y}`,
                        `${selectedTransformGizmo.corners.northEast.x},${selectedTransformGizmo.corners.northEast.y}`,
                        `${selectedTransformGizmo.corners.southEast.x},${selectedTransformGizmo.corners.southEast.y}`,
                        `${selectedTransformGizmo.corners.southWest.x},${selectedTransformGizmo.corners.southWest.y}`,
                      ].join(' ')}
                    />
                    <line
                      className="nexus-transform-gizmo-stem"
                      x1={selectedTransformGizmo.topCenter.x}
                      y1={selectedTransformGizmo.topCenter.y}
                      x2={selectedTransformGizmo.rotateHandle.x}
                      y2={selectedTransformGizmo.rotateHandle.y}
                    />
                  </svg>

                  {selectedTransformGizmo.scaleHandles.map((handle) => (
                    <button
                      key={handle.id}
                      type="button"
                      data-transform-handle={handle.id}
                      title={`Scale ${handle.id.replace('scale-', '').toUpperCase()}`}
                      className={`nexus-transform-handle nexus-transform-handle-scale ${
                        transformMode === 'scale' ? 'is-active' : ''
                      }`}
                      style={{
                        left: `${handle.point.x}px`,
                        top: `${handle.point.y}px`,
                        cursor: handle.cursor,
                      }}
                      onMouseDown={(event) => {
                        if (!selectedEntity) {
                          return;
                        }
                        setTransformMode('scale');
                        beginTransformDrag(event, selectedEntity, 'scale', {scaleHandle: handle});
                      }}
                    />
                  ))}

                  <button
                    type="button"
                    data-transform-handle="rotate"
                    title="Rotate"
                    className={`nexus-transform-handle nexus-transform-handle-rotate ${
                      transformMode === 'rotate' ? 'is-active' : ''
                    }`}
                    style={{
                      left: `${selectedTransformGizmo.rotateHandle.x}px`,
                      top: `${selectedTransformGizmo.rotateHandle.y}px`,
                      cursor: 'grab',
                    }}
                    onMouseDown={(event) => {
                      if (!selectedEntity) {
                        return;
                      }
                      setTransformMode('rotate');
                      beginTransformDrag(event, selectedEntity, 'rotate');
                    }}
                  />
                </div>
              )}

              {!isPlaying && activeScene.entities.length === 0 && (
                <div className="nexus-stage-empty">
                  <div className="text-[12px] font-semibold text-[var(--text)]">Empty scene</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">Add actors from the left panel, or reopen Projects to load a sample.</div>
                </div>
              )}

              {viewportMode === 'mobile' && isPlaying && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
                  <div className="pointer-events-auto rounded-sm border border-[var(--border)] bg-[#232529] p-2">
                    <div className="grid grid-cols-3 gap-1">
                      <TouchButton onPress={(value) => handleRuntimeControls('up', value)}>▲</TouchButton>
                      <span />
                      <span />
                      <TouchButton onPress={(value) => handleRuntimeControls('left', value)}>◀</TouchButton>
                      <TouchButton onPress={() => undefined}>●</TouchButton>
                      <TouchButton onPress={(value) => handleRuntimeControls('right', value)}>▶</TouchButton>
                      <span />
                      <TouchButton onPress={(value) => handleRuntimeControls('down', value)}>▼</TouchButton>
                      <span />
                    </div>
                  </div>

                  <div className="pointer-events-auto flex flex-col gap-3">
                    <ActionTouchButton onPress={(value) => handleRuntimeControls('jump', value)}>JUMP</ActionTouchButton>
                    <ActionTouchButton onPress={(value) => handleRuntimeControls('action', value)}>ACT</ActionTouchButton>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <div className="nexus-runtime-bar">
            <div className="flex flex-wrap items-center gap-2">
              <RuntimeBadge label="Camera">
                {runtimeSnapshot ? `${runtimeSnapshot.camera.x}, ${runtimeSnapshot.camera.y}` : '0, 0'}
              </RuntimeBadge>
              <RuntimeBadge label="Zoom">{runtimeSnapshot?.camera.zoom ?? 1}</RuntimeBadge>
              <RuntimeBadge label="Selection">{selectedEntity?.name ?? 'none'}</RuntimeBadge>
              <RuntimeBadge label="Sim">{isPlaying ? 'running' : 'stopped'}</RuntimeBadge>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {stageViewportMode === 'world'
                ? 'World view active. The frame inside the scene marks the in-game camera coverage.'
                : 'Camera view active. This viewport previews what the player sees in game.'}
            </div>
          </div>
        </section>

        {rightSidebarOpen && (
          <motion.aside
            initial={{x: 24, opacity: 0}}
            animate={{x: 0, opacity: 1}}
            className={`nexus-panel ${isCompact ? 'nexus-panel-floating-right' : 'nexus-panel-right'}`}
          >
            <PanelHeader
              icon={rightTab === 'inspector' ? <Settings2 size={16} /> : <Bot size={16} />}
              title={rightTab === 'inspector' ? 'Details' : 'Assistant'}
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex rounded-sm border border-[var(--border)] bg-[#202226] p-0.5">
                    <ModeButton active={rightTab === 'inspector'} onClick={() => setRightTab('inspector')}>
                      <Settings2 size={15} />
                    </ModeButton>
                    <ModeButton active={rightTab === 'ai'} onClick={() => setRightTab('ai')}>
                      <Bot size={15} />
                    </ModeButton>
                  </div>
                  {isCompact && (
                    <IconButton onClick={() => setRightSidebarOpen(false)} title="Close">
                      <X size={16} />
                    </IconButton>
                  )}
                </div>
              }
            />
            {rightTab === 'inspector' && (
              <div className="nexus-panel-search">
                <input
                  value={detailsFilter}
                  onChange={(event) => setDetailsFilter(event.target.value)}
                  placeholder={detailsPlaceholder}
                  className="nexus-input"
                />
              </div>
            )}
            <div className="nexus-panel-body">
              {rightTab === 'ai' ? (
                <AiPanel
                  aiHealth={aiHealth}
                  aiMode={aiMode}
                  setAiMode={setAiMode}
                  aiPrompt={aiPrompt}
                  setAiPrompt={setAiPrompt}
                  aiIdeas={AI_IDEAS}
                  aiStatus={aiStatus}
                  aiError={aiError}
                  aiSummary={aiSummary}
                  aiNotes={aiNotes}
                  onRun={() => void runAiGeneration()}
                />
              ) : selectedEntity ? (
                <ComponentInspector
                  selectedEntity={selectedEntity}
                  project={project}
                  filterText={detailsFilter}
                  updateEntity={(updater) => mutateSelectedEntity(updater)}
                  replaceTransform={(updater, options) => replaceComponent<TransformComponent>(ComponentType.Transform, updater, options)}
                  replaceSprite={(updater, options) => replaceComponent<SpriteComponent>(ComponentType.Sprite, updater, options)}
                  replaceRigidBody={(updater, options) => replaceComponent<RigidBodyComponent>(ComponentType.RigidBody, updater, options)}
                  replaceCollider={(updater, options) => replaceComponent<ColliderComponent>(ComponentType.Collider, updater, options)}
                  replaceBehavior={(updater, options) => replaceComponent<BehaviorComponent>(ComponentType.Behavior, updater, options)}
                  updateScript={(code) =>
                    mutateSelectedEntity((entity) => {
                      entity.components = entity.components.map((component) =>
                        component.type === ComponentType.Script ? {...component, code} : component,
                      );
                    })
                  }
                  addComponent={addComponentToSelection}
                  removeComponent={removeComponentFromSelection}
                />
              ) : (
                <SceneInspector
                  activeScene={activeScene}
                  project={project}
                  aiSummary={aiSummary}
                  filterText={detailsFilter}
                  editorCameraStart={engineRef.current?.getEditorCameraFrame() ?? null}
                  captureCameraStart={captureCameraStart}
                  mutateActiveScene={mutateActiveScene}
                  mutateProject={mutateProject}
                />
              )}
            </div>
          </motion.aside>
        )}
      </main>

      <section className="nexus-drawer" data-open={contentDrawerOpen}>
        <div className="nexus-drawer-header">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setContentDrawerOpen((open) => !open)}
              className={`nexus-status-button ${contentDrawerOpen ? 'is-active' : ''}`}
            >
              <FolderOpen size={14} />
              Content Drawer
            </button>
            <span className="text-[11px] text-[var(--muted)]">{project.assets.length} imported assets</span>
          </div>
          <div className="flex items-center gap-2">
            {contentDrawerOpen && (
              <div className="w-[220px] max-w-[35vw]">
                <input
                  value={assetFilter}
                  onChange={(event) => setAssetFilter(event.target.value)}
                  placeholder="Filter assets"
                  className="nexus-input"
                />
              </div>
            )}
            <button
              onClick={() => assetInputRef.current?.click()}
              className="nexus-ghost-button"
            >
              <ImagePlus size={14} />
              Import Sprite
            </button>
          </div>
        </div>

        {contentDrawerOpen && (
          <div className="nexus-drawer-body">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
              {filteredAssets.map((asset) => (
                <div key={asset.id} className="rounded-sm border border-[var(--border)] bg-[#26282c] p-2">
                  <div className="aspect-square overflow-hidden rounded-sm border border-[#1a1b1f] bg-[#18191c]">
                    <img src={asset.url} alt={asset.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="mt-2 truncate text-[11px] text-[var(--muted)]">{asset.name}</div>
                </div>
              ))}
              {filteredAssets.length === 0 && (
                <div className="nexus-section-empty col-span-full">
                  {project.assets.length === 0 ? 'No assets imported yet. Use Import Sprite to populate the content drawer.' : 'No assets match the current filter.'}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <footer className="nexus-footer">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setContentDrawerOpen((open) => !open)}
            className={`nexus-status-button ${contentDrawerOpen ? 'is-active' : ''}`}
          >
            <FolderOpen size={14} />
            Content
          </button>
          <div className="nexus-divider" />
          <RuntimeBadge label="Scene">{activeScene.name}</RuntimeBadge>
          <RuntimeBadge label="Selection">{selectedEntity?.name ?? 'none'}</RuntimeBadge>
          <RuntimeBadge label="AI">{aiHealth?.vertexAiConfigured ? 'ready' : 'check config'}</RuntimeBadge>
        </div>
        <div className="nexus-status-line">
          {isPlaying
            ? 'Runtime active. Grid controls stay available: Mouse Wheel zoom, Middle/Right Mouse pan.'
            : 'Editor ready. Drag selected actors to move, use corner handles to scale, use the top handle to rotate. Shortcuts: W/E/R, Delete, Mouse Wheel zoom, Middle/Right Mouse pan, Ctrl/Cmd+Drag inside camera frame to move camera start, Ctrl/Cmd+S, Ctrl/Cmd+Z.'}
        </div>
      </footer>

      {launcherOpen && (
        <ProjectLauncher
          hasSavedProject={Boolean(storedProject)}
          onClose={() => setLauncherOpen(false)}
          onCreateBlank={() => launchProject(createBlankProject())}
          onResumeSaved={() => {
            if (storedProject) {
              launchProject(storedProject);
            }
          }}
          onLoadPlatformer={() => launchProject(createSampleProject('platformer'))}
          onLoadTopDown={() => launchProject(createSampleProject('topdown'))}
          onImportProject={() => importProjectInputRef.current?.click()}
        />
      )}
    </div>
  );
}
